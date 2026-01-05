from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
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
    AgentSessionAnnotationModel,
    SpanModel,
    SpanType,
)
from app.services.audit_service import log_create, log_update


router = APIRouter(tags=["sessions"])


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


def _status_filter_values(value: str) -> List[str]:
    normalized = _normalize_status(value)
    if normalized == "completed":
        return ["completed", "complete", "success", "succeeded", "ok"]
    if normalized == "error":
        return ["error", "failed", "failure"]
    if normalized == "active":
        return ["active", "running", "in_progress"]
    return [value]
def _to_run_response(run: AgentRunModel) -> "AgentRunResponse":
    return AgentRunResponse(
        id=run.id,
        session_id=run.session_id,
        project_id=run.project_id,
        trace_id=run.trace_id,
        status=_normalize_status(run.status),
        started_at=run.started_at,
        ended_at=run.ended_at,
        total_tokens=run.total_tokens,
        total_cost=run.total_cost,
        total_latency=run.total_latency,
        tags=run.tags or [],
        metadata=run.metadata_ or {},
        created_at=run.created_at,
    )


def _run_sort_key(run: AgentRunModel) -> int:
    if run.ended_at:
        return run.ended_at
    if run.started_at:
        return run.started_at
    return 0


def _summarize_runs(runs: List[AgentRunModel]) -> dict[str, Any]:
    if not runs:
        return {
            "run_count": 0,
            "error_count": 0,
            "active_count": 0,
            "last_status": None,
            "last_run_id": None,
            "last_run_at": None,
        }
    error_count = 0
    active_count = 0
    for run in runs:
        normalized = _normalize_status(run.status)
        if normalized == "error":
            error_count += 1
        elif normalized == "active":
            active_count += 1
    last_run = max(runs, key=_run_sort_key)
    last_run_at = _run_sort_key(last_run)
    return {
        "run_count": len(runs),
        "error_count": error_count,
        "active_count": active_count,
        "last_status": _normalize_status(last_run.status),
        "last_run_id": last_run.id,
        "last_run_at": last_run_at or None,
    }


def _to_session_response(
    session: AgentSessionModel,
    run_summary: Optional[dict[str, Any]] = None,
) -> "AgentSessionResponse":
    summary = run_summary or {}
    status = _normalize_status(session.status)
    if summary:
        if summary.get("active_count", 0) > 0:
            status = "active"
        elif summary.get("last_status"):
            status = summary["last_status"]
    summary_last_run_at = summary.get("last_run_at")
    session_last_run_at = session.last_run_at
    if summary_last_run_at and (not session_last_run_at or summary_last_run_at > session_last_run_at):
        session_last_run_at = summary_last_run_at
    return AgentSessionResponse(
        id=session.id,
        project_id=session.project_id,
        agent_name=session.agent_name,
        env=session.env,
        status=status,
        tags=session.tags or [],
        metadata=session.metadata_ or {},
        created_at=session.created_at,
        updated_at=session.updated_at,
        last_run_at=session_last_run_at,
        run_count=summary.get("run_count", 0),
        error_count=summary.get("error_count", 0),
        last_status=summary.get("last_status"),
        last_run_id=summary.get("last_run_id"),
    )


class AgentSessionResponse(BaseModel):
    id: str
    project_id: str
    agent_name: Optional[str] = None
    env: Optional[str] = None
    status: str
    tags: List[str] = []
    metadata: Dict[str, Any] = {}
    created_at: int
    updated_at: int
    last_run_at: Optional[int] = None
    run_count: int = 0
    error_count: int = 0
    last_status: Optional[str] = None
    last_run_id: Optional[str] = None

    class Config:
        from_attributes = True


class AgentRunResponse(BaseModel):
    id: str
    session_id: str
    project_id: str
    trace_id: Optional[str] = None
    status: str
    started_at: int
    ended_at: Optional[int] = None
    total_tokens: Optional[int] = None
    total_cost: Optional[float] = None
    total_latency: Optional[float] = None
    tags: List[str] = []
    metadata: Dict[str, Any] = {}
    created_at: int

    class Config:
        from_attributes = True


class AgentSessionDetailResponse(BaseModel):
    session: AgentSessionResponse
    runs: List[AgentRunResponse]


class SessionEventResponse(BaseModel):
    id: str
    session_id: str
    run_id: Optional[str] = None
    sequence: int
    event_type: str
    timestamp: int
    payload: Dict[str, Any] = {}

    class Config:
        from_attributes = True


class SessionAnnotationResponse(BaseModel):
    id: str
    session_id: str
    project_id: str
    labels: List[str] = []
    severity: Optional[str] = None
    owner: Optional[str] = None
    status: str
    note: Optional[str] = None
    created_at: int
    updated_at: int

    class Config:
        from_attributes = True


class SessionAnnotationCreate(BaseModel):
    labels: List[str] = []
    severity: Optional[str] = None
    owner: Optional[str] = None
    status: str = "open"
    note: Optional[str] = None


class SessionAnnotationUpdate(BaseModel):
    labels: Optional[List[str]] = None
    severity: Optional[str] = None
    owner: Optional[str] = None
    status: Optional[str] = None
    note: Optional[str] = None


class RunGraphNode(BaseModel):
    id: str
    span_id: str
    name: str
    kind: str
    status: str
    start_time: int
    end_time: int
    duration_ms: float
    depth: int
    lane: int
    parent_id: Optional[str] = None
    retry_parent_id: Optional[str] = None
    input: Dict[str, Any] = {}
    output: Dict[str, Any] = {}
    attributes: Dict[str, Any] = {}
    metrics: Dict[str, Any] = {}
    tags: List[str] = []


class RunGraphEdge(BaseModel):
    from_id: str
    to_id: str
    kind: str = "parent"


class RunGraphResponse(BaseModel):
    run_id: str
    trace_id: str
    root_id: str
    nodes: List[RunGraphNode]
    edges: List[RunGraphEdge]
    layout: Dict[str, Any] = {}


def _map_span_kind(span_type: SpanType, name: str) -> str:
    if span_type == SpanType.LLM:
        return "llm_call"
    if span_type == SpanType.TOOL:
        return "tool_call"
    if span_type == SpanType.RETRIEVER:
        return "retrieval"
    if span_type == SpanType.CHAIN:
        return "chain"
    lowered = (name or "").lower()
    if "guardrail" in lowered:
        return "guardrail"
    return "span"


@router.get("/sessions", response_model=List[AgentSessionResponse])
async def list_sessions(
    project_id: str = Query(..., description="Project ID"),
    agent_name: Optional[str] = None,
    env: Optional[str] = None,
    status: Optional[str] = None,
    start_time: Optional[int] = None,
    end_time: Optional[int] = None,
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
):
    query = select(AgentSessionModel).where(AgentSessionModel.project_id == project_id)

    if agent_name:
        query = query.where(AgentSessionModel.agent_name == agent_name)
    if env:
        query = query.where(AgentSessionModel.env == env)
    if status:
        query = query.where(AgentSessionModel.status.in_(_status_filter_values(status)))
    if start_time:
        query = query.where(AgentSessionModel.created_at >= start_time)
    if end_time:
        query = query.where(AgentSessionModel.created_at <= end_time)

    query = query.order_by(AgentSessionModel.created_at.desc()).offset(offset).limit(limit)
    result = await session.execute(query)
    sessions = result.scalars().all()
    if not sessions:
        return []
    session_ids = [item.id for item in sessions]
    runs_result = await session.execute(
        select(AgentRunModel).where(AgentRunModel.session_id.in_(session_ids))
    )
    runs = runs_result.scalars().all()
    runs_by_session: Dict[str, List[AgentRunModel]] = {session_id: [] for session_id in session_ids}
    for run in runs:
        runs_by_session.setdefault(run.session_id, []).append(run)
    return [
        _to_session_response(item, _summarize_runs(runs_by_session.get(item.id, [])))
        for item in sessions
    ]


@router.get("/sessions/{session_id}", response_model=AgentSessionDetailResponse)
async def get_session_detail(
    session_id: str,
    run_limit: int = Query(default=50, le=200),
    session: AsyncSession = Depends(get_session),
):
    db_session = await session.get(AgentSessionModel, session_id)
    if not db_session:
        raise HTTPException(status_code=404, detail="Session not found")

    runs_stmt = (
        select(AgentRunModel)
        .where(AgentRunModel.session_id == session_id)
        .order_by(AgentRunModel.started_at.desc())
        .limit(run_limit)
    )
    runs_result = await session.execute(runs_stmt)
    runs = runs_result.scalars().all()

    return AgentSessionDetailResponse(
        session=_to_session_response(db_session, _summarize_runs(runs)),
        runs=[_to_run_response(run) for run in runs],
    )


@router.get("/runs/{run_id}", response_model=AgentRunResponse)
async def get_run(run_id: str, session: AsyncSession = Depends(get_session)):
    db_run = await session.get(AgentRunModel, run_id)
    if not db_run:
        raise HTTPException(status_code=404, detail="Run not found")
    return _to_run_response(db_run)


@router.get("/sessions/{session_id}/timeline", response_model=List[SessionEventResponse])
async def get_session_timeline(
    session_id: str,
    limit: int = Query(default=200, le=1000),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
):
    db_session = await session.get(AgentSessionModel, session_id)
    if not db_session:
        raise HTTPException(status_code=404, detail="Session not found")

    stmt = (
        select(AgentSessionEventModel)
        .where(AgentSessionEventModel.session_id == session_id)
        .order_by(
            AgentSessionEventModel.timestamp.asc(),
            AgentSessionEventModel.sequence.asc(),
            AgentSessionEventModel.id.asc(),
        )
        .offset(offset)
        .limit(limit)
    )
    result = await session.execute(stmt)
    return result.scalars().all()


@router.get("/sessions/{session_id}/annotations", response_model=List[SessionAnnotationResponse])
async def list_session_annotations(
    session_id: str,
    session: AsyncSession = Depends(get_session),
):
    db_session = await session.get(AgentSessionModel, session_id)
    if not db_session:
        raise HTTPException(status_code=404, detail="Session not found")

    stmt = (
        select(AgentSessionAnnotationModel)
        .where(AgentSessionAnnotationModel.session_id == session_id)
        .order_by(AgentSessionAnnotationModel.created_at.desc())
    )
    result = await session.execute(stmt)
    return result.scalars().all()


@router.post("/sessions/{session_id}/annotations", response_model=SessionAnnotationResponse, status_code=201)
async def create_session_annotation(
    session_id: str,
    payload: SessionAnnotationCreate,
    session: AsyncSession = Depends(get_session),
):
    db_session = await session.get(AgentSessionModel, session_id)
    if not db_session:
        raise HTTPException(status_code=404, detail="Session not found")

    now = _now_ms()
    annotation = AgentSessionAnnotationModel(
        id=f"ann_{uuid.uuid4().hex[:16]}",
        session_id=session_id,
        project_id=db_session.project_id,
        labels=payload.labels,
        severity=payload.severity,
        owner=payload.owner,
        status=payload.status,
        note=payload.note,
        created_at=now,
        updated_at=now,
    )
    session.add(annotation)
    await log_create(
        session=session,
        entity_type="session_annotation",
        entity_id=annotation.id,
        entity_data={
            "session_id": session_id,
            "project_id": db_session.project_id,
            "status": payload.status,
        },
        project_id=db_session.project_id,
    )
    await session.commit()
    await session.refresh(annotation)
    return annotation


@router.patch("/sessions/annotations/{annotation_id}", response_model=SessionAnnotationResponse)
async def update_session_annotation(
    annotation_id: str,
    payload: SessionAnnotationUpdate,
    session: AsyncSession = Depends(get_session),
):
    annotation = await session.get(AgentSessionAnnotationModel, annotation_id)
    if not annotation:
        raise HTTPException(status_code=404, detail="Annotation not found")

    before = {
        "labels": annotation.labels,
        "severity": annotation.severity,
        "owner": annotation.owner,
        "status": annotation.status,
        "note": annotation.note,
    }

    if payload.labels is not None:
        annotation.labels = payload.labels
    if payload.severity is not None:
        annotation.severity = payload.severity
    if payload.owner is not None:
        annotation.owner = payload.owner
    if payload.status is not None:
        annotation.status = payload.status
    if payload.note is not None:
        annotation.note = payload.note

    annotation.updated_at = _now_ms()

    after = {
        "labels": annotation.labels,
        "severity": annotation.severity,
        "owner": annotation.owner,
        "status": annotation.status,
        "note": annotation.note,
    }

    await log_update(
        session=session,
        entity_type="session_annotation",
        entity_id=annotation.id,
        old_values=before,
        new_values=after,
        project_id=annotation.project_id,
    )

    await session.commit()
    await session.refresh(annotation)
    return annotation


@router.get("/runs/{run_id}/graph", response_model=RunGraphResponse)
async def get_run_graph(run_id: str, session: AsyncSession = Depends(get_session)):
    db_run = await session.get(AgentRunModel, run_id)
    if not db_run:
        raise HTTPException(status_code=404, detail="Run not found")
    if not db_run.trace_id:
        raise HTTPException(status_code=404, detail="Run has no trace_id")

    stmt = (
        select(SpanModel)
        .where(SpanModel.trace_id == db_run.trace_id)
        .order_by(SpanModel.start_time.asc(), SpanModel.id.asc())
    )
    result = await session.execute(stmt)
    spans = result.scalars().all()
    if not spans:
        raise HTTPException(status_code=404, detail="Trace has no spans")

    span_map = {span.id: span for span in spans}

    root_span = next((s for s in spans if s.parent_id is None), None)
    if not root_span:
        root_span = min(spans, key=lambda s: s.start_time)

    depth_cache: Dict[str, int] = {}

    def compute_depth(span_id: str) -> int:
        if span_id in depth_cache:
            return depth_cache[span_id]
        span = span_map.get(span_id)
        if not span or not span.parent_id:
            depth_cache[span_id] = 0
            return 0
        if span.parent_id not in span_map:
            depth_cache[span_id] = 0
            return 0
        depth_cache[span_id] = compute_depth(span.parent_id) + 1
        return depth_cache[span_id]

    lane_by_depth: Dict[int, int] = {}
    nodes: List[RunGraphNode] = []
    edges: List[RunGraphEdge] = []

    for span in spans:
        if span.parent_id and span.parent_id in span_map:
            edges.append(RunGraphEdge(from_id=span.parent_id, to_id=span.id, kind="parent"))

    for span in spans:
        retry_parent_id = None
        if isinstance(span.attributes, dict):
            retry_parent_id = span.attributes.get("retry_parent_id") or span.attributes.get("retry_of")
        if retry_parent_id and retry_parent_id in span_map:
            edges.append(RunGraphEdge(from_id=retry_parent_id, to_id=span.id, kind="retry"))

    for span in sorted(spans, key=lambda s: (s.start_time, s.end_time, s.id)):
        depth = compute_depth(span.id)
        lane = lane_by_depth.get(depth, 0)
        lane_by_depth[depth] = lane + 1
        duration_ms = max(float(span.end_time - span.start_time), 0.0)
        nodes.append(
            RunGraphNode(
                id=span.id,
                span_id=span.id,
                name=span.name,
                kind=_map_span_kind(span.type, span.name),
                status=span.status,
                start_time=span.start_time,
                end_time=span.end_time,
                duration_ms=duration_ms,
                depth=depth,
                lane=lane,
                parent_id=span.parent_id,
                retry_parent_id=retry_parent_id,
                input=span.input or {},
                output=span.output or {},
                attributes=span.attributes or {},
                metrics=span.metrics or {},
                tags=span.tags or [],
            )
        )

    max_depth = max((node.depth for node in nodes), default=0)
    max_lane = max((node.lane for node in nodes), default=0)

    return RunGraphResponse(
        run_id=db_run.id,
        trace_id=db_run.trace_id,
        root_id=root_span.id,
        nodes=nodes,
        edges=edges,
        layout={
            "max_depth": max_depth,
            "max_lane": max_lane,
            "lane_counts": lane_by_depth,
        },
    )
