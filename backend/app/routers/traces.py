"""
Traces Router - Trace and span ingestion plus trace listing by project.
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import List, Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.database import get_session
from app.models import Trace, Span, TraceModel, SpanModel, SpanMetrics, SpanAttributes
from app.services.trace_service import TraceService


router = APIRouter(tags=["traces"])


def _normalize_span_metrics(raw: Optional[Dict[str, Any]]) -> SpanMetrics:
    data = dict(raw or {})
    if data.get("latency_ms") is None:
        data["latency_ms"] = 0.0
    return SpanMetrics(**data)


def _normalize_span_attributes(raw: Optional[Dict[str, Any]]) -> SpanAttributes:
    if isinstance(raw, dict):
        return SpanAttributes(**raw)
    return SpanAttributes(**{})


def _to_span_pydantic(sm: SpanModel) -> Span:
    return Span(
        id=sm.id,
        trace_id=sm.trace_id,
        parent_id=sm.parent_id,
        name=sm.name,
        type=sm.type,
        start_time=sm.start_time,
        end_time=sm.end_time,
        status=sm.status,
        input=sm.input or {},
        output=sm.output or {},
        metrics=_normalize_span_metrics(sm.metrics),
        attributes=_normalize_span_attributes(sm.attributes),
        tags=sm.tags or [],
        error_message=sm.error_message,
    )


@router.get("/projects/{project_id}/traces", response_model=List[Trace])
async def get_project_traces(
    project_id: str,
    status: Optional[str] = None,
    parent_trace_id: Optional[str] = None,
    search: Optional[str] = None,
    start_time: Optional[int] = None,
    end_time: Optional[int] = None,
    limit: int = 100,
    offset: int = 0,
    session: AsyncSession = Depends(get_session),
):
    query = select(TraceModel).where(TraceModel.project_id == project_id)

    if status and status != "all":
        query = query.where(TraceModel.status == status)

    if parent_trace_id:
        query = query.where(TraceModel.parent_trace_id == parent_trace_id)

    if start_time:
        query = query.where(TraceModel.timestamp >= start_time)

    if end_time:
        query = query.where(TraceModel.timestamp <= end_time)

    if search:
        query = query.join(SpanModel, TraceModel.id == SpanModel.trace_id).where(
            (SpanModel.parent_id == None) &
            (SpanModel.name.contains(search) | TraceModel.id.contains(search))
        )

    query = query.order_by(TraceModel.timestamp.desc()).offset(offset).limit(limit)
    result = await session.execute(query)
    trace_models = result.scalars().all()

    trace_ids = [tm.id for tm in trace_models]
    spans_by_trace: dict[str, list[SpanModel]] = {}
    if trace_ids:
        spans_statement = select(SpanModel).where(SpanModel.trace_id.in_(trace_ids))
        spans_result = await session.execute(spans_statement)
        spans = spans_result.scalars().all()
        for span in spans:
            spans_by_trace.setdefault(span.trace_id, []).append(span)

    api_traces = []
    for tm in trace_models:
        spans = spans_by_trace.get(tm.id, [])

        converted_spans = [_to_span_pydantic(s) for s in spans]
        root_span = next((s for s in converted_spans if not s.parent_id), None)

        if root_span:
            api_traces.append(
                Trace(
                    id=tm.id,
                    root_span=root_span,
                    spans=converted_spans,
                    project_id=tm.project_id,
                    parent_trace_id=tm.parent_trace_id,
                    trace_group_id=tm.trace_group_id,
                    input_span_id=tm.input_span_id,
                    output_span_id=tm.output_span_id,
                    timestamp=tm.timestamp,
                    total_latency=tm.total_latency,
                    total_cost=tm.total_cost,
                    total_tokens=tm.total_tokens,
                    status=tm.status,
                    tags=tm.tags or [],
                )
            )

    return api_traces


@router.get("/traces/{trace_id}", response_model=Trace)
async def get_trace(
    trace_id: str,
    session: AsyncSession = Depends(get_session),
):
    trace_model = await session.get(TraceModel, trace_id)
    if not trace_model:
        raise HTTPException(status_code=404, detail="Trace not found")

    spans_statement = (
        select(SpanModel)
        .where(SpanModel.trace_id == trace_id)
        .order_by(SpanModel.start_time)
    )
    spans_result = await session.execute(spans_statement)
    spans = spans_result.scalars().all()
    if not spans:
        raise HTTPException(status_code=404, detail="Trace has no spans")

    converted_spans = [_to_span_pydantic(s) for s in spans]
    root_span = next((s for s in converted_spans if not s.parent_id), None)
    if not root_span:
        raise HTTPException(status_code=404, detail="Trace root span not found")

    return Trace(
        id=trace_model.id,
        root_span=root_span,
        spans=converted_spans,
        project_id=trace_model.project_id,
        parent_trace_id=trace_model.parent_trace_id,
        trace_group_id=trace_model.trace_group_id,
        input_span_id=trace_model.input_span_id,
        output_span_id=trace_model.output_span_id,
        timestamp=trace_model.timestamp,
        total_latency=trace_model.total_latency,
        total_cost=trace_model.total_cost,
        total_tokens=trace_model.total_tokens,
        status=trace_model.status,
        tags=trace_model.tags or [],
    )


@router.post("/traces", response_model=Dict[str, str])
async def create_trace(trace: Trace, session: AsyncSession = Depends(get_session)):
    service = TraceService()
    try:
        trace_model, span_models, root_span_id = service.build_models(trace)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    session.add(trace_model)
    for span_model in span_models:
        session.add(span_model)

    await session.commit()
    return {
        "status": "success",
        "trace_id": trace.id,
        "root_span_id": root_span_id or trace.root_span.id,
    }


@router.post("/traces/batch", response_model=Dict[str, Any])
async def create_traces_batch(
    traces: List[Trace],
    session: AsyncSession = Depends(get_session),
):
    if len(traces) > 10:
        raise HTTPException(
            status_code=400,
            detail="Batch size cannot exceed 10 traces",
        )

    if len(traces) == 0:
        raise HTTPException(
            status_code=400,
            detail="Batch must contain at least one trace",
        )

    service = TraceService()
    created_traces = []

    for trace in traces:
        try:
            trace_model, span_models, root_span_id = service.build_models(trace)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

        session.add(trace_model)
        for span_model in span_models:
            session.add(span_model)

        created_traces.append(
            {
                "trace_id": trace.id,
                "root_span_id": root_span_id or trace.root_span.id,
            }
        )

    await session.commit()

    return {
        "status": "success",
        "count": len(created_traces),
        "traces": created_traces,
    }
