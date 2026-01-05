from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Any, Dict, List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select
import time
import uuid

from app.database import get_session
from app.models import (
    AgentSessionModel,
    AgentRunModel,
    AgentSessionEventModel,
    AgentSessionIngestModel,
    Trace,
    Span,
    SpanMetrics,
    SpanAttributes,
    SpanType,
    TraceModel,
)
from app.services.trace_service import TraceService


router = APIRouter(tags=["ingest"])


def _now_ms() -> int:
    return int(time.time() * 1000)


def _normalize_status(value: Optional[str]) -> str:
    if not value:
        return "completed"
    lowered = value.lower()
    if lowered in {"completed", "complete", "success", "succeeded", "ok"}:
        return "completed"
    if lowered in {"error", "failed", "failure"}:
        return "error"
    if lowered in {"active", "running", "in_progress"}:
        return "active"
    return value


def _run_sort_key(run: AgentRunModel) -> int:
    if run.ended_at:
        return run.ended_at
    if run.started_at:
        return run.started_at
    return 0


def _merge_tags(existing: List[str], incoming: List[str]) -> List[str]:
    seen = set(existing)
    merged = list(existing)
    for tag in incoming:
        if tag not in seen:
            merged.append(tag)
            seen.add(tag)
    return merged


def _merge_metadata(existing: Dict[str, Any], incoming: Dict[str, Any]) -> Dict[str, Any]:
    merged = dict(existing)
    merged.update(incoming)
    return merged


def _normalize_metrics(metrics: Optional[Dict[str, Any]]) -> SpanMetrics:
    data = dict(metrics or {})
    if "latency_ms" not in data:
        data["latency_ms"] = 0.0
    return SpanMetrics(**data)


def _normalize_attributes(attributes: Optional[Dict[str, Any]]) -> SpanAttributes:
    return SpanAttributes(**(attributes or {}))


class IngestSpan(BaseModel):
    id: str
    parent_id: Optional[str] = None
    name: str
    type: SpanType
    start_time: int
    end_time: int
    status: str
    input: Optional[Dict[str, Any]] = None
    output: Optional[Dict[str, Any]] = None
    metrics: Optional[Dict[str, Any]] = None
    attributes: Optional[Dict[str, Any]] = None
    tags: List[str] = []
    error_message: Optional[str] = None


class IngestTrace(BaseModel):
    trace_id: str
    parent_trace_id: Optional[str] = None
    trace_group_id: Optional[str] = None
    input_span_id: Optional[str] = None
    output_span_id: Optional[str] = None
    timestamp: int
    total_latency: Optional[float] = 0.0
    total_cost: Optional[float] = 0.0
    total_tokens: Optional[int] = 0
    status: str = "success"
    tags: List[str] = []
    spans: List[IngestSpan]


class IngestRun(BaseModel):
    run_id: Optional[str] = None
    trace: IngestTrace
    status: Optional[str] = None
    started_at: Optional[int] = None
    ended_at: Optional[int] = None
    tags: List[str] = []
    metadata: Dict[str, Any] = {}


class IngestEvent(BaseModel):
    event_type: str
    timestamp: int
    run_id: Optional[str] = None
    sequence: Optional[int] = None
    payload: Dict[str, Any] = {}


class IngestSession(BaseModel):
    session_id: Optional[str] = None
    project_id: str
    agent_name: Optional[str] = None
    env: Optional[str] = None
    started_at: Optional[int] = None
    tags: List[str] = []
    metadata: Dict[str, Any] = {}
    runs: List[IngestRun] = []
    events: List[IngestEvent] = []


class SessionIngestRequest(BaseModel):
    schema_version: str = "v0"
    session: IngestSession


class SessionIngestResponse(BaseModel):
    status: str
    session_id: str
    run_ids: List[str]
    trace_ids: List[str]
    event_count: int


def _build_trace(
    ingest_trace: IngestTrace,
    project_id: str,
    session_id: str,
) -> Trace:
    spans: List[Span] = []
    for span in ingest_trace.spans:
        span_metrics = _normalize_metrics(span.metrics)
        span_attributes = _normalize_attributes(span.attributes)
        spans.append(
            Span(
                id=span.id,
                trace_id=ingest_trace.trace_id,
                parent_id=span.parent_id,
                name=span.name,
                type=span.type,
                start_time=span.start_time,
                end_time=span.end_time,
                status=span.status,
                input=span.input or {},
                output=span.output or {},
                metrics=span_metrics,
                attributes=span_attributes,
                tags=span.tags,
                error_message=span.error_message,
            )
        )

    if not spans:
        raise ValueError("Trace must include at least one span")

    root_span = next((span for span in spans if not span.parent_id), None)
    if not root_span:
        raise ValueError("Trace must include a root span with no parent_id")

    return Trace(
        id=ingest_trace.trace_id,
        root_span=root_span,
        spans=spans,
        project_id=project_id,
        parent_trace_id=ingest_trace.parent_trace_id,
        trace_group_id=ingest_trace.trace_group_id or session_id,
        input_span_id=ingest_trace.input_span_id,
        output_span_id=ingest_trace.output_span_id,
        timestamp=ingest_trace.timestamp,
        total_latency=ingest_trace.total_latency or 0.0,
        total_cost=ingest_trace.total_cost or 0.0,
        total_tokens=ingest_trace.total_tokens or 0,
        status=ingest_trace.status,
        tags=ingest_trace.tags,
    )


@router.post("/ingest", response_model=SessionIngestResponse)
async def ingest_session(
    payload: SessionIngestRequest,
    session: AsyncSession = Depends(get_session),
):
    if payload.schema_version != "v0":
        raise HTTPException(status_code=400, detail="Unsupported schema_version")

    now = _now_ms()
    ingest_session = payload.session
    session_id = ingest_session.session_id or f"sess_{uuid.uuid4().hex[:16]}"
    project_id = ingest_session.project_id

    db_session = await session.get(AgentSessionModel, session_id)
    if db_session:
        if db_session.project_id != project_id:
            raise HTTPException(status_code=400, detail="project_id mismatch for session")
        if ingest_session.agent_name:
            db_session.agent_name = ingest_session.agent_name
        if ingest_session.env:
            db_session.env = ingest_session.env
        if ingest_session.tags:
            db_session.tags = _merge_tags(db_session.tags, ingest_session.tags)
        if ingest_session.metadata:
            db_session.metadata_ = _merge_metadata(db_session.metadata_, ingest_session.metadata)
        db_session.updated_at = now
    else:
        db_session = AgentSessionModel(
            id=session_id,
            project_id=project_id,
            agent_name=ingest_session.agent_name,
            env=ingest_session.env,
            status="active",
            tags=ingest_session.tags,
            metadata_=ingest_session.metadata,
            created_at=ingest_session.started_at or now,
            updated_at=now,
            last_run_at=None,
        )
        session.add(db_session)

    trace_service = TraceService()
    run_ids: List[str] = []
    trace_ids: List[str] = []
    for run in ingest_session.runs:
        run_id = run.run_id or f"run_{uuid.uuid4().hex[:16]}"
        trace_ids.append(run.trace.trace_id)

        existing_trace = await session.get(TraceModel, run.trace.trace_id)
        if not existing_trace:
            try:
                trace_payload = _build_trace(run.trace, project_id, session_id)
                trace_model, span_models, _root_span_id = trace_service.build_models(trace_payload)
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc))
            session.add(trace_model)
            for span_model in span_models:
                session.add(span_model)
        elif existing_trace.project_id != project_id:
            raise HTTPException(status_code=400, detail="trace_id belongs to another project")

        db_run = await session.get(AgentRunModel, run_id)
        started_at = run.started_at or run.trace.timestamp or now
        run_status = _normalize_status(run.status or run.trace.status)
        ended_at = run.ended_at
        latency_ms = int(run.trace.total_latency or 0)
        if ended_at is None and run_status != "active":
            ended_at = started_at + latency_ms if latency_ms else started_at

        if db_run:
            if db_run.session_id != session_id:
                raise HTTPException(status_code=400, detail="session_id mismatch for run")
            db_run.trace_id = run.trace.trace_id
            db_run.status = run_status
            db_run.started_at = started_at
            db_run.ended_at = ended_at
            if run.trace.total_tokens is not None:
                db_run.total_tokens = run.trace.total_tokens
            if run.trace.total_cost is not None:
                db_run.total_cost = run.trace.total_cost
            if run.trace.total_latency is not None:
                db_run.total_latency = run.trace.total_latency
            if run.tags:
                db_run.tags = _merge_tags(db_run.tags, run.tags)
            if run.metadata:
                db_run.metadata_ = _merge_metadata(db_run.metadata_, run.metadata)
        else:
            db_run = AgentRunModel(
                id=run_id,
                session_id=session_id,
                project_id=project_id,
                trace_id=run.trace.trace_id,
                status=run_status,
                started_at=started_at,
                ended_at=ended_at,
                total_tokens=run.trace.total_tokens or 0,
                total_cost=run.trace.total_cost or 0.0,
                total_latency=run.trace.total_latency or 0.0,
                tags=run.tags,
                metadata_=run.metadata,
                created_at=now,
            )
            session.add(db_run)

        run_ids.append(run_id)

    await session.flush()
    runs_result = await session.execute(
        select(AgentRunModel).where(AgentRunModel.session_id == session_id)
    )
    all_runs = runs_result.scalars().all()
    if all_runs:
        last_run = max(all_runs, key=_run_sort_key)
        last_run_at = _run_sort_key(last_run)
        if last_run_at:
            db_session.last_run_at = last_run_at
        normalized_statuses = [_normalize_status(run.status) for run in all_runs]
        if "active" in normalized_statuses:
            db_session.status = "active"
        else:
            db_session.status = _normalize_status(last_run.status)
        db_session.updated_at = max(db_session.updated_at, db_session.last_run_at or db_session.updated_at)

    event_count = 0
    for idx, event in enumerate(ingest_session.events):
        sequence = event.sequence if event.sequence is not None else idx
        db_event = AgentSessionEventModel(
            id=f"evt_{uuid.uuid4().hex[:16]}",
            session_id=session_id,
            run_id=event.run_id,
            sequence=sequence,
            event_type=event.event_type,
            timestamp=event.timestamp,
            payload=event.payload,
            created_at=now,
        )
        session.add(db_event)
        event_count += 1

    ingest_record = AgentSessionIngestModel(
        id=f"ing_{uuid.uuid4().hex[:16]}",
        project_id=project_id,
        session_id=session_id,
        schema_version=payload.schema_version,
        payload=payload.model_dump(),
        created_at=now,
    )
    session.add(ingest_record)

    await session.commit()

    return SessionIngestResponse(
        status="success",
        session_id=session_id,
        run_ids=run_ids,
        trace_ids=trace_ids,
        event_count=event_count,
    )
