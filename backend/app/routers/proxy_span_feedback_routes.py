import time
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models import SpanFeedbackModel, SpanModel, SpanScoreModel, TraceModel
from app.schemas.proxy_observability import SpanFeedbackRequest, SpanScoreRequest

router = APIRouter()


@router.post("/spans/{span_id}/feedback", response_model=SpanFeedbackModel)
async def create_span_feedback(
    span_id: str,
    payload: SpanFeedbackRequest,
    session: AsyncSession = Depends(get_session),
):
    span = await session.get(SpanModel, span_id)
    if not span:
        raise HTTPException(status_code=404, detail="Span not found")
    trace = await session.get(TraceModel, span.trace_id)
    if not trace:
        raise HTTPException(status_code=404, detail="Trace not found")
    feedback = SpanFeedbackModel(
        id=f"fb_{uuid.uuid4().hex[:16]}",
        project_id=trace.project_id,
        trace_id=trace.id,
        span_id=span.id,
        feedback_type=payload.feedback_type,
        value=payload.value,
        comment=payload.comment,
        labels=payload.labels,
        metadata_=payload.metadata,
        created_at=int(time.time() * 1000),
    )
    span.attributes = {
        **(span.attributes or {}),
        "feedback_count": int((span.attributes or {}).get("feedback_count", 0)) + 1,
        "last_feedback_type": payload.feedback_type,
    }
    session.add(feedback)
    session.add(span)
    await session.commit()
    await session.refresh(feedback)
    return feedback

@router.post("/spans/{span_id}/scores", response_model=SpanScoreModel)
async def upsert_span_score(
    span_id: str,
    payload: SpanScoreRequest,
    session: AsyncSession = Depends(get_session),
):
    span = await session.get(SpanModel, span_id)
    if not span:
        raise HTTPException(status_code=404, detail="Span not found")
    trace = await session.get(TraceModel, span.trace_id)
    if not trace:
        raise HTTPException(status_code=404, detail="Trace not found")
    from sqlmodel import select

    result = await session.execute(select(SpanScoreModel).where(
        SpanScoreModel.span_id == span_id,
        SpanScoreModel.name == payload.name,
    ))
    score = result.scalar_one_or_none()
    now = int(time.time() * 1000)
    if not score:
        score = SpanScoreModel(
            id=f"score_{uuid.uuid4().hex[:16]}",
            project_id=trace.project_id,
            trace_id=trace.id,
            span_id=span.id,
            name=payload.name,
            created_at=now,
        )
    score.score = payload.score
    score.passed = payload.passed
    score.reasoning = payload.reasoning
    score.metadata_ = payload.metadata
    score.updated_at = now
    span.attributes = {
        **(span.attributes or {}),
        "scores": {
            **((span.attributes or {}).get("scores") or {}),
            payload.name: {
                "score": payload.score,
                "passed": payload.passed,
                "reasoning": payload.reasoning,
            },
        },
    }
    session.add(score)
    session.add(span)
    await session.commit()
    await session.refresh(score)
    return score
