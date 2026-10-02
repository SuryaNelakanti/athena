"""Persist session, run, trace, and event data from an ingest payload."""

from __future__ import annotations

import uuid
from typing import List

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.models import (
    AgentRunModel,
    AgentSessionEventModel,
    AgentSessionIngestModel,
    AgentSessionModel,
    TraceModel,
)
from app.schemas.session_ingest import (
    IngestRun,
    IngestSession,
    SessionIngestRequest,
    SessionIngestResponse,
)
from app.services.automation_service import AutomationService
from app.services.session_ingest_normalizer import (
    build_ingest_trace,
    merge_metadata,
    merge_tags,
    normalize_run_status,
    now_ms,
    run_sort_key,
)
from app.services.trace_service import TraceService


class SessionIngestError(ValueError):
    """Raised when an ingest payload conflicts with existing session data."""


class SessionIngestService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.trace_service = TraceService()

    async def ingest(self, payload: SessionIngestRequest) -> SessionIngestResponse:
        if payload.schema_version != "v0":
            raise SessionIngestError("Unsupported schema_version")

        now = now_ms()
        ingest_session = payload.session
        session_id = ingest_session.session_id or f"sess_{uuid.uuid4().hex[:16]}"
        project_id = ingest_session.project_id
        db_session = await self._upsert_session(ingest_session, session_id, now)

        run_ids: List[str] = []
        trace_ids: List[str] = []
        for run in ingest_session.runs:
            run_id = await self._upsert_run(run, session_id, project_id, now)
            run_ids.append(run_id)
            trace_ids.append(run.trace.trace_id)

        await self.session.flush()
        await self._update_session_summary(db_session, session_id)
        event_count = await self._persist_events(ingest_session, session_id, now)
        self._persist_ingest_record(payload, session_id, project_id, now)
        await self._evaluate_automations(run_ids)
        await self.session.commit()

        return SessionIngestResponse(
            status="success",
            session_id=session_id,
            run_ids=run_ids,
            trace_ids=trace_ids,
            event_count=event_count,
        )

    async def _upsert_session(
        self,
        payload: IngestSession,
        session_id: str,
        now: int,
    ) -> AgentSessionModel:
        db_session = await self.session.get(AgentSessionModel, session_id)
        if db_session:
            if db_session.project_id != payload.project_id:
                raise SessionIngestError("project_id mismatch for session")
            if payload.agent_name:
                db_session.agent_name = payload.agent_name
            if payload.env:
                db_session.env = payload.env
            if payload.tags:
                db_session.tags = merge_tags(db_session.tags, payload.tags)
            if payload.metadata:
                db_session.metadata_ = merge_metadata(db_session.metadata_, payload.metadata)
            db_session.updated_at = now
            return db_session

        db_session = AgentSessionModel(
            id=session_id,
            project_id=payload.project_id,
            agent_name=payload.agent_name,
            env=payload.env,
            status="active",
            tags=payload.tags,
            metadata_=payload.metadata,
            created_at=payload.started_at or now,
            updated_at=now,
            last_run_at=None,
        )
        self.session.add(db_session)
        return db_session

    async def _upsert_run(
        self,
        payload: IngestRun,
        session_id: str,
        project_id: str,
        now: int,
    ) -> str:
        run_id = payload.run_id or f"run_{uuid.uuid4().hex[:16]}"
        await self._ensure_trace(payload, project_id, session_id)

        db_run = await self.session.get(AgentRunModel, run_id)
        started_at = payload.started_at or payload.trace.timestamp or now
        run_status = normalize_run_status(payload.status or payload.trace.status)
        ended_at = payload.ended_at
        latency_ms = int(payload.trace.total_latency or 0)
        if ended_at is None and run_status != "active":
            ended_at = started_at + latency_ms if latency_ms else started_at

        if db_run:
            self._update_existing_run(
                db_run,
                payload,
                session_id,
                run_status,
                started_at,
                ended_at,
            )
        else:
            self.session.add(
                AgentRunModel(
                    id=run_id,
                    session_id=session_id,
                    project_id=project_id,
                    trace_id=payload.trace.trace_id,
                    status=run_status,
                    started_at=started_at,
                    ended_at=ended_at,
                    total_tokens=payload.trace.total_tokens or 0,
                    total_cost=payload.trace.total_cost or 0.0,
                    total_latency=payload.trace.total_latency or 0.0,
                    tags=payload.tags,
                    metadata_=payload.metadata,
                    created_at=now,
                )
            )
        return run_id

    async def _ensure_trace(self, run: IngestRun, project_id: str, session_id: str) -> None:
        existing_trace = await self.session.get(TraceModel, run.trace.trace_id)
        if existing_trace:
            if existing_trace.project_id != project_id:
                raise SessionIngestError("trace_id belongs to another project")
            return

        try:
            trace_payload = build_ingest_trace(run.trace, project_id, session_id)
            trace_model, span_models, _root_span_id = self.trace_service.build_models(trace_payload)
        except ValueError as error:
            raise SessionIngestError(str(error)) from error
        self.session.add(trace_model)
        for span_model in span_models:
            self.session.add(span_model)

    @staticmethod
    def _update_existing_run(
        db_run: AgentRunModel,
        payload: IngestRun,
        session_id: str,
        status: str,
        started_at: int,
        ended_at: int | None,
    ) -> None:
        if db_run.session_id != session_id:
            raise SessionIngestError("session_id mismatch for run")
        db_run.trace_id = payload.trace.trace_id
        db_run.status = status
        db_run.started_at = started_at
        db_run.ended_at = ended_at
        if payload.trace.total_tokens is not None:
            db_run.total_tokens = payload.trace.total_tokens
        if payload.trace.total_cost is not None:
            db_run.total_cost = payload.trace.total_cost
        if payload.trace.total_latency is not None:
            db_run.total_latency = payload.trace.total_latency
        if payload.tags:
            db_run.tags = merge_tags(db_run.tags, payload.tags)
        if payload.metadata:
            db_run.metadata_ = merge_metadata(db_run.metadata_, payload.metadata)

    async def _update_session_summary(
        self,
        db_session: AgentSessionModel,
        session_id: str,
    ) -> None:
        result = await self.session.execute(
            select(AgentRunModel).where(AgentRunModel.session_id == session_id)
        )
        all_runs = result.scalars().all()
        if not all_runs:
            return

        last_run = max(all_runs, key=run_sort_key)
        last_run_at = run_sort_key(last_run)
        if last_run_at:
            db_session.last_run_at = last_run_at
        normalized_statuses = [normalize_run_status(run.status) for run in all_runs]
        if "active" in normalized_statuses:
            db_session.status = "active"
        else:
            db_session.status = normalize_run_status(last_run.status)
        db_session.updated_at = max(
            db_session.updated_at,
            db_session.last_run_at or db_session.updated_at,
        )

    def _persist_ingest_record(
        self,
        payload: SessionIngestRequest,
        session_id: str,
        project_id: str,
        now: int,
    ) -> None:
        self.session.add(
            AgentSessionIngestModel(
                id=f"ing_{uuid.uuid4().hex[:16]}",
                project_id=project_id,
                session_id=session_id,
                schema_version=payload.schema_version,
                payload=payload.model_dump(),
                created_at=now,
            )
        )

    async def _persist_events(
        self,
        payload: IngestSession,
        session_id: str,
        now: int,
    ) -> int:
        for idx, event in enumerate(payload.events):
            sequence = event.sequence if event.sequence is not None else idx
            self.session.add(
                AgentSessionEventModel(
                    id=f"evt_{uuid.uuid4().hex[:16]}",
                    session_id=session_id,
                    run_id=event.run_id,
                    sequence=sequence,
                    event_type=event.event_type,
                    timestamp=event.timestamp,
                    payload=event.payload,
                    created_at=now,
                )
            )
        return len(payload.events)

    async def _evaluate_automations(self, run_ids: list[str]) -> None:
        automation_service = AutomationService(self.session)
        for run_id in run_ids:
            run = await self.session.get(AgentRunModel, run_id)
            if run:
                await automation_service.evaluate_run(run)
