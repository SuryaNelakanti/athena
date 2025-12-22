from typing import Any, List, Optional
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from ..database import get_session
from ..models import ReviewItemModel, TraceModel, SpanModel
from ..services.dataset_service import DatasetService


router = APIRouter(prefix="/reviews", tags=["reviews"])


class ReviewItemCreate(BaseModel):
    project_id: str
    org_id: Optional[str] = None
    source_type: str
    source_id: str
    priority: Optional[int] = 0
    labels: Optional[List[str]] = None
    score: Optional[float] = None
    notes: Optional[str] = None
    meta: Optional[dict[str, Any]] = None


class ReviewItemUpdate(BaseModel):
    status: Optional[str] = None
    priority: Optional[int] = None
    labels: Optional[List[str]] = None
    score: Optional[float] = None
    notes: Optional[str] = None
    meta: Optional[dict[str, Any]] = None


class ReviewFromTraceRequest(BaseModel):
    trace_id: str
    project_id: Optional[str] = None
    priority: Optional[int] = 0
    labels: Optional[List[str]] = None
    notes: Optional[str] = None


class ReviewPromoteRequest(BaseModel):
    dataset_id: str
    corrected_expected: Optional[dict] = None
    example_type: Optional[str] = "gold"
    row_kind: Optional[str] = None
    eval_label: Optional[str] = None


def _extract_preview_text(value: Any, max_len: int = 240) -> str:
    if isinstance(value, str):
        text = value.strip()
    elif isinstance(value, dict):
        for key in ("prompt", "input", "text", "query", "content", "answer"):
            if isinstance(value.get(key), str):
                text = value[key].strip()
                break
        else:
            text = str(value)
    else:
        text = str(value)

    if len(text) <= max_len:
        return text
    return text[: max_len - 3].rstrip() + "..."


async def _load_trace_with_spans(session: AsyncSession, trace_id: str) -> tuple[TraceModel, list[SpanModel]]:
    trace = await session.get(TraceModel, trace_id)
    if not trace:
        raise HTTPException(status_code=404, detail=f"Trace {trace_id} not found")

    stmt = select(SpanModel).where(SpanModel.trace_id == trace_id).order_by(SpanModel.start_time)
    result = await session.execute(stmt)
    spans = result.scalars().all()
    if not spans:
        raise HTTPException(status_code=400, detail="Trace has no spans")
    return trace, spans


@router.get("/", response_model=List[ReviewItemModel])
async def list_reviews(
    project_id: str,
    status: Optional[str] = None,
    source_type: Optional[str] = None,
    limit: int = 200,
    offset: int = 0,
    session: AsyncSession = Depends(get_session),
):
    stmt = select(ReviewItemModel).where(ReviewItemModel.project_id == project_id)
    if status:
        stmt = stmt.where(ReviewItemModel.status == status)
    if source_type:
        stmt = stmt.where(ReviewItemModel.source_type == source_type)
    stmt = stmt.order_by(ReviewItemModel.created_at.desc()).offset(offset).limit(limit)
    res = await session.execute(stmt)
    return res.scalars().all()


@router.get("/{review_id}", response_model=ReviewItemModel)
async def get_review(
    review_id: str,
    session: AsyncSession = Depends(get_session),
):
    review = await session.get(ReviewItemModel, review_id)
    if not review:
        raise HTTPException(status_code=404, detail="Review item not found")
    return review


@router.post("/", response_model=ReviewItemModel)
async def create_review(
    payload: ReviewItemCreate,
    session: AsyncSession = Depends(get_session),
):
    review = ReviewItemModel(
        id=f"rev_{uuid.uuid4().hex[:10]}",
        org_id=payload.org_id,
        project_id=payload.project_id,
        source_type=payload.source_type,
        source_id=payload.source_id,
        status="open",
        priority=int(payload.priority or 0),
        labels=payload.labels or [],
        score=payload.score,
        notes=payload.notes,
        meta=payload.meta or {},
        created_at=int(time.time() * 1000),
        updated_at=int(time.time() * 1000),
    )
    session.add(review)
    await session.commit()
    await session.refresh(review)
    return review


@router.post("/from-trace", response_model=ReviewItemModel)
async def create_review_from_trace(
    payload: ReviewFromTraceRequest,
    session: AsyncSession = Depends(get_session),
):
    trace, spans = await _load_trace_with_spans(session, payload.trace_id)
    first_span = spans[0]
    last_span = spans[-1]

    model = None
    provider = None
    if isinstance(last_span.attributes, dict):
        model = last_span.attributes.get("model")
        provider = last_span.attributes.get("provider")

    meta = {
        "trace_id": trace.id,
        "trace_status": trace.status,
        "input_preview": _extract_preview_text(first_span.input),
        "output_preview": _extract_preview_text(last_span.output),
        "model": model,
        "provider": provider,
        "span_count": len(spans),
    }

    review = ReviewItemModel(
        id=f"rev_{uuid.uuid4().hex[:10]}",
        org_id=None,
        project_id=payload.project_id or trace.project_id,
        source_type="trace",
        source_id=trace.id,
        status="open",
        priority=int(payload.priority or 0),
        labels=payload.labels or [],
        notes=payload.notes,
        meta=meta,
        created_at=int(time.time() * 1000),
        updated_at=int(time.time() * 1000),
    )
    session.add(review)
    await session.commit()
    await session.refresh(review)
    return review


@router.patch("/{review_id}", response_model=ReviewItemModel)
async def update_review(
    review_id: str,
    payload: ReviewItemUpdate,
    session: AsyncSession = Depends(get_session),
):
    review = await session.get(ReviewItemModel, review_id)
    if not review:
        raise HTTPException(status_code=404, detail="Review item not found")

    if payload.status is not None:
        review.status = payload.status
        if payload.status in {"resolved", "dismissed"}:
            review.resolved_at = int(time.time() * 1000)
    if payload.priority is not None:
        review.priority = int(payload.priority)
    if payload.labels is not None:
        review.labels = payload.labels
    if payload.score is not None:
        review.score = payload.score
    if payload.notes is not None:
        review.notes = payload.notes
    if payload.meta is not None:
        review.meta = payload.meta

    review.updated_at = int(time.time() * 1000)
    session.add(review)
    await session.commit()
    await session.refresh(review)
    return review


@router.post("/{review_id}/promote", response_model=ReviewItemModel)
async def promote_review_to_dataset(
    review_id: str,
    payload: ReviewPromoteRequest,
    session: AsyncSession = Depends(get_session),
):
    review = await session.get(ReviewItemModel, review_id)
    if not review:
        raise HTTPException(status_code=404, detail="Review item not found")
    if review.source_type != "trace":
        raise HTTPException(status_code=400, detail="Only trace-based reviews are supported for promotion")

    trace, spans = await _load_trace_with_spans(session, review.source_id)
    first_span = spans[0]
    last_span = spans[-1]

    input_data = first_span.input or {}
    if payload.corrected_expected is not None:
        expected_data = payload.corrected_expected
    else:
        output = last_span.output or {}
        if isinstance(output, dict):
            if "output_text" in output:
                expected_data = {"answer": output["output_text"]}
            elif "value" in output:
                expected_data = {"answer": output["value"]}
            else:
                expected_data = output
        else:
            expected_data = {"answer": str(output)}

    service = DatasetService(session)
    row = await service.add_row(
        dataset_id=payload.dataset_id,
        input_data=input_data,
        expected_data=expected_data,
        meta={"promoted_from_review": True, "review_id": review.id},
        example_type=payload.example_type,
        row_kind=payload.row_kind,
        eval_label=payload.eval_label,
        source_trace_id=trace.id,
        version_meta={"source": "review", "review_id": review.id, "trace_id": trace.id},
    )

    review.dataset_id = payload.dataset_id
    review.dataset_row_id = row.id
    review.status = "resolved"
    review.resolved_at = int(time.time() * 1000)
    review.updated_at = int(time.time() * 1000)
    session.add(review)
    await session.commit()
    await session.refresh(review)
    return review
