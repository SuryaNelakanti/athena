from typing import List, Optional, TypedDict

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.models import AgentRunModel, AgentSessionEventModel, AgentSessionModel
from app.schemas.sessions import (
    AgentRunResponse,
    AgentSessionDetailResponse,
    AgentSessionResponse,
    SessionEventResponse,
)


class SessionRunSummary(TypedDict):
    run_count: int
    error_count: int
    active_count: int
    total_cost: float
    total_latency: float
    total_tokens: int
    last_status: Optional[str]
    last_run_id: Optional[str]
    last_run_at: Optional[int]


class SessionQueryService:
    """Read sessions and runs and assemble their API response models."""

    def __init__(self, session: AsyncSession):
        self.session = session

    @staticmethod
    def normalize_status(value: Optional[str]) -> str:
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

    @classmethod
    def _status_filter_values(cls, value: str) -> List[str]:
        normalized = cls.normalize_status(value)
        if normalized == "completed":
            return ["completed", "complete", "success", "succeeded", "ok"]
        if normalized == "error":
            return ["error", "failed", "failure"]
        if normalized == "active":
            return ["active", "running", "in_progress"]
        return [value]

    @staticmethod
    def _run_sort_key(run: AgentRunModel) -> int:
        if run.ended_at:
            return run.ended_at
        if run.started_at:
            return run.started_at
        return 0

    @classmethod
    def summarize_runs(cls, runs: List[AgentRunModel]) -> SessionRunSummary:
        if not runs:
            return {
                "run_count": 0,
                "error_count": 0,
                "active_count": 0,
                "total_cost": 0.0,
                "total_latency": 0.0,
                "total_tokens": 0,
                "last_status": None,
                "last_run_id": None,
                "last_run_at": None,
            }

        error_count = 0
        active_count = 0
        total_cost = 0.0
        total_latency = 0.0
        total_tokens = 0
        for run in runs:
            normalized = cls.normalize_status(run.status)
            if normalized == "error":
                error_count += 1
            elif normalized == "active":
                active_count += 1
            if run.total_cost:
                total_cost += run.total_cost
            if run.total_latency:
                total_latency += run.total_latency
            if run.total_tokens:
                total_tokens += run.total_tokens

        last_run = max(runs, key=cls._run_sort_key)
        last_run_at = cls._run_sort_key(last_run)
        return {
            "run_count": len(runs),
            "error_count": error_count,
            "active_count": active_count,
            "total_cost": total_cost,
            "total_latency": total_latency,
            "total_tokens": total_tokens,
            "last_status": cls.normalize_status(last_run.status),
            "last_run_id": last_run.id,
            "last_run_at": last_run_at or None,
        }

    @classmethod
    def to_run_response(cls, run: AgentRunModel) -> AgentRunResponse:
        return AgentRunResponse(
            id=run.id,
            session_id=run.session_id,
            project_id=run.project_id,
            trace_id=run.trace_id,
            status=cls.normalize_status(run.status),
            started_at=run.started_at,
            ended_at=run.ended_at,
            total_tokens=run.total_tokens,
            total_cost=run.total_cost,
            total_latency=run.total_latency,
            tags=run.tags or [],
            metadata=run.metadata_ or {},
            created_at=run.created_at,
        )

    @classmethod
    def to_session_response(
        cls,
        session: AgentSessionModel,
        run_summary: Optional[SessionRunSummary] = None,
    ) -> AgentSessionResponse:
        summary = run_summary or {}
        status = cls.normalize_status(session.status)
        if summary:
            if summary.get("active_count", 0) > 0:
                status = "active"
            elif summary.get("last_status"):
                status = summary["last_status"] or status

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
            total_cost=summary.get("total_cost", 0.0),
            total_latency=summary.get("total_latency", 0.0),
            total_tokens=summary.get("total_tokens", 0),
            last_status=summary.get("last_status"),
            last_run_id=summary.get("last_run_id"),
        )

    async def list_sessions(
        self,
        project_id: str,
        *,
        agent_name: Optional[str] = None,
        env: Optional[str] = None,
        status: Optional[str] = None,
        start_time: Optional[int] = None,
        end_time: Optional[int] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[AgentSessionResponse]:
        query = select(AgentSessionModel).where(AgentSessionModel.project_id == project_id)
        if agent_name:
            query = query.where(AgentSessionModel.agent_name == agent_name)
        if env:
            query = query.where(AgentSessionModel.env == env)
        if status:
            query = query.where(AgentSessionModel.status.in_(self._status_filter_values(status)))
        if start_time:
            query = query.where(AgentSessionModel.created_at >= start_time)
        if end_time:
            query = query.where(AgentSessionModel.created_at <= end_time)

        query = query.order_by(AgentSessionModel.created_at.desc()).offset(offset).limit(limit)
        result = await self.session.execute(query)
        sessions = result.scalars().all()
        if not sessions:
            return []

        session_ids = [item.id for item in sessions]
        runs_result = await self.session.execute(
            select(AgentRunModel).where(AgentRunModel.session_id.in_(session_ids))
        )
        runs = runs_result.scalars().all()
        runs_by_session: dict[str, List[AgentRunModel]] = {session_id: [] for session_id in session_ids}
        for run in runs:
            runs_by_session.setdefault(run.session_id, []).append(run)

        return [
            self.to_session_response(item, self.summarize_runs(runs_by_session.get(item.id, [])))
            for item in sessions
        ]

    async def get_session_detail(
        self,
        session_id: str,
        *,
        run_limit: int = 50,
    ) -> Optional[AgentSessionDetailResponse]:
        db_session = await self.session.get(AgentSessionModel, session_id)
        if not db_session:
            return None

        runs_stmt = (
            select(AgentRunModel)
            .where(AgentRunModel.session_id == session_id)
            .order_by(AgentRunModel.started_at.desc())
            .limit(run_limit)
        )
        runs_result = await self.session.execute(runs_stmt)
        runs = runs_result.scalars().all()
        return AgentSessionDetailResponse(
            session=self.to_session_response(db_session, self.summarize_runs(runs)),
            runs=[self.to_run_response(run) for run in runs],
        )

    async def get_run(self, run_id: str) -> Optional[AgentRunResponse]:
        run = await self.session.get(AgentRunModel, run_id)
        return self.to_run_response(run) if run else None

    async def get_session_timeline(
        self,
        session_id: str,
        *,
        limit: int = 200,
        offset: int = 0,
    ) -> Optional[List[SessionEventResponse]]:
        db_session = await self.session.get(AgentSessionModel, session_id)
        if not db_session:
            return None

        statement = (
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
        result = await self.session.execute(statement)
        return result.scalars().all()
