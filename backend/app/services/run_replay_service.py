"""Create a replay run from the frozen source trace data."""

from __future__ import annotations

import time
import uuid

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.models import AgentRunModel, RunReplayModel, SpanModel, TraceModel


def _now_ms() -> int:
    return int(time.time() * 1000)


async def create_frozen_replay(
    session: AsyncSession,
    source_run: AgentRunModel,
    source_trace: TraceModel,
) -> tuple[RunReplayModel, AgentRunModel]:
    """Persist a replay run that reuses the source trace's frozen span data."""
    replay_trace_id = f"trace_replay_{uuid.uuid4().hex[:12]}"
    replay_run_id = f"run_replay_{uuid.uuid4().hex[:12]}"
    now = _now_ms()

    replay_trace = _build_replay_trace(source_trace, source_run.id, replay_trace_id, now)
    session.add(replay_trace)
    source_spans = await _load_source_spans(session, source_trace.id)
    replay_spans = _build_replay_spans(source_spans, source_trace, replay_trace_id, now)
    session.add_all(replay_spans)

    replay_run = _build_replay_run(source_run, replay_run_id, replay_trace_id, now)
    replay = _build_replay_record(source_run, replay_run_id, replay_trace_id, len(source_spans), now)
    session.add(replay_run)
    session.add(replay)

    await session.commit()
    await session.refresh(replay_run)
    await session.refresh(replay)
    return replay, replay_run


async def _load_source_spans(
    session: AsyncSession,
    source_trace_id: str,
) -> list[SpanModel]:
    result = await session.execute(
        select(SpanModel).where(SpanModel.trace_id == source_trace_id)
    )
    return list(result.scalars().all())


def _build_replay_trace(
    source_trace: TraceModel,
    source_run_id: str,
    replay_trace_id: str,
    now: int,
) -> TraceModel:
    return TraceModel(
        id=replay_trace_id,
        project_id=source_trace.project_id,
        parent_trace_id=source_trace.id,
        trace_group_id=source_trace.trace_group_id or source_trace.id,
        input_span_id=source_trace.input_span_id,
        output_span_id=source_trace.output_span_id,
        timestamp=now,
        total_latency=source_trace.total_latency,
        total_cost=0.0,
        total_tokens=source_trace.total_tokens,
        status="completed",
        tags=[*(source_trace.tags or []), "replay:true", f"source_run:{source_run_id}"],
    )


def _build_replay_spans(
    source_spans: list[SpanModel],
    source_trace: TraceModel,
    replay_trace_id: str,
    now: int,
) -> list[SpanModel]:
    span_id_map = {
        span.id: f"span_replay_{uuid.uuid4().hex[:12]}"
        for span in source_spans
    }
    return [
        SpanModel(
            id=span_id_map[span.id],
            trace_id=replay_trace_id,
            parent_id=span_id_map.get(span.parent_id) if span.parent_id else None,
            name=span.name,
            type=span.type,
            start_time=now + max(0, span.start_time - source_trace.timestamp),
            end_time=now + max(0, span.end_time - source_trace.timestamp),
            status=span.status,
            input=span.input or {},
            output=span.output or {},
            metrics={**(span.metrics or {}), "replay_frozen": True},
            attributes={
                **(span.attributes or {}),
                "replay_source_span_id": span.id,
                "frozen_tool_results": True,
            },
            tags=[*(span.tags or []), "replay"],
            error_message=span.error_message,
        )
        for span in source_spans
    ]


def _build_replay_run(
    source_run: AgentRunModel,
    replay_run_id: str,
    replay_trace_id: str,
    now: int,
) -> AgentRunModel:
    return AgentRunModel(
        id=replay_run_id,
        session_id=source_run.session_id,
        project_id=source_run.project_id,
        trace_id=replay_trace_id,
        status="completed",
        started_at=now,
        ended_at=now + int(source_run.total_latency or 0),
        total_tokens=source_run.total_tokens,
        total_cost=0.0,
        total_latency=source_run.total_latency,
        tags=[*(source_run.tags or []), "replay"],
        metadata_={**(source_run.metadata_ or {}), "replay_source_run_id": source_run.id},
        created_at=now,
    )


def _build_replay_record(
    source_run: AgentRunModel,
    replay_run_id: str,
    replay_trace_id: str,
    span_count: int,
    now: int,
) -> RunReplayModel:
    return RunReplayModel(
        id=f"replay_{uuid.uuid4().hex[:16]}",
        project_id=source_run.project_id,
        source_run_id=source_run.id,
        replay_run_id=replay_run_id,
        mode="frozen_tools",
        status="created",
        summary={
            "source_trace_id": source_run.trace_id,
            "replay_trace_id": replay_trace_id,
            "span_count": span_count,
        },
        created_at=now,
    )
