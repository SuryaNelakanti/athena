from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.database import get_session
from app.models import AgentRunModel, SpanModel, TraceModel
from app.schemas.sessions import ReplayRunResponse, RunCompareResponse, RunGraphResponse
from app.services.run_comparison_service import build_run_comparison
from app.services.run_graph_service import build_run_graph
from app.services.run_replay_service import create_frozen_replay
from app.services.session_query_service import SessionQueryService

router = APIRouter(tags=["sessions"])


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

    return build_run_graph(db_run, spans)


@router.post("/runs/{run_id}/replay", response_model=ReplayRunResponse)
async def replay_run(run_id: str, session: AsyncSession = Depends(get_session)):
    source_run = await session.get(AgentRunModel, run_id)
    if not source_run:
        raise HTTPException(status_code=404, detail="Run not found")
    if not source_run.trace_id:
        raise HTTPException(status_code=400, detail="Run has no trace to replay")
    source_trace = await session.get(TraceModel, source_run.trace_id)
    if not source_trace:
        raise HTTPException(status_code=404, detail="Source trace not found")

    replay, replay_run = await create_frozen_replay(session, source_run, source_trace)
    return ReplayRunResponse(
        replay=replay,
        run=SessionQueryService.to_run_response(replay_run),
    )


@router.get(
    "/runs/{run_id}/compare/{other_run_id}",
    response_model=RunCompareResponse,
)
async def compare_runs(
    run_id: str,
    other_run_id: str,
    session: AsyncSession = Depends(get_session),
):
    baseline = await session.get(AgentRunModel, run_id)
    candidate = await session.get(AgentRunModel, other_run_id)
    if not baseline or not candidate:
        raise HTTPException(status_code=404, detail="Run not found")
    if not baseline.trace_id or not candidate.trace_id:
        raise HTTPException(status_code=400, detail="Both runs need trace_id")

    baseline_spans_result = await session.execute(
        select(SpanModel).where(SpanModel.trace_id == baseline.trace_id)
    )
    candidate_spans_result = await session.execute(
        select(SpanModel).where(SpanModel.trace_id == candidate.trace_id)
    )
    return build_run_comparison(
        baseline,
        candidate,
        baseline_spans_result.scalars().all(),
        candidate_spans_result.scalars().all(),
    )
