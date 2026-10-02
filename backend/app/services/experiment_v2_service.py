from __future__ import annotations

from dataclasses import dataclass
from typing import Optional
import time
import uuid

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.models import (
    DatasetModel,
    ExperimentModel,
    ExperimentRunModel,
    ExperimentRunResultModel,
    ExperimentVersionModel,
)
from app.services.experiment_run_executor import ExperimentRunExecutor


@dataclass(frozen=True)
class ScorerConfig:
    """Configuration for a single scorer in an experiment version."""
    type: str  # e.g., "exact_match", "llm_judge", "contains"
    weight: float = 1.0  # Weight for weighted average calculation
    threshold: float = 0.8  # Pass threshold for this scorer
    is_primary: bool = False  # If True, used for default sort/filter


@dataclass(frozen=True)
class VersionConfig:
    parent_version_id: Optional[str]
    model_registry_id: str
    provider: str
    model_id: str
    # Core inference params
    temperature: float = 1.0
    max_tokens: Optional[int] = None
    top_p: Optional[float] = None
    frequency_penalty: Optional[float] = None
    presence_penalty: Optional[float] = None
    stop_sequences: Optional[tuple[str, ...]] = None
    # Prompt config
    system_prompt: str = ""
    prompt_template: Optional[str] = None
    # Advanced
    reasoning_effort: Optional[str] = None  # "low" | "medium" | "high"
    json_mode: Optional[bool] = None
    seed: Optional[int] = None
    # Scorers - now a tuple of ScorerConfig objects
    scorers: tuple[ScorerConfig, ...] = ()
    # Metadata
    notes: str = ""

    def get_primary_scorer(self) -> Optional[ScorerConfig]:
        """Returns the primary scorer, or first scorer if none marked primary."""
        for s in self.scorers:
            if s.is_primary:
                return s
        return self.scorers[0] if self.scorers else None

    def get_scorer_by_type(self, scorer_type: str) -> Optional[ScorerConfig]:
        """Returns scorer config by type name."""
        for s in self.scorers:
            if s.type == scorer_type:
                return s
        return None


class ExperimentV2Service:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create_version(self, experiment_id: str, config: VersionConfig) -> ExperimentVersionModel:
        experiment = await self.session.get(ExperimentModel, experiment_id)
        if not experiment:
            raise ValueError("Experiment not found")

        # Validate parent belongs to same experiment.
        if config.parent_version_id:
            parent = await self.session.get(ExperimentVersionModel, config.parent_version_id)
            if not parent or parent.experiment_id != experiment_id:
                raise ValueError("Invalid parent_version_id")

        # Pin dataset version.
        dataset = await self.session.get(DatasetModel, experiment.dataset_id)
        dataset_version_pinned = dataset.version if dataset else 1

        max_stmt = (
            select(ExperimentVersionModel.version_number)
            .where(ExperimentVersionModel.experiment_id == experiment_id)
            .order_by(ExperimentVersionModel.version_number.desc())
            .limit(1)
        )
        res = await self.session.execute(max_stmt)
        latest = res.scalar_one_or_none()
        version_number = int(latest) + 1 if latest is not None else 1

        version = ExperimentVersionModel(
            id=f"ev_{uuid.uuid4().hex[:10]}",
            experiment_id=experiment_id,
            version_number=version_number,
            parent_version_id=config.parent_version_id,
            dataset_version_pinned=dataset_version_pinned,
            config={
                "task": {
                    "type": "chat",
                    "input_mode": "auto",
                    "system_prompt": config.system_prompt,
                    "prompt_template": config.prompt_template,
                },
                "model": {
                    "registry_id": config.model_registry_id,
                    "provider": config.provider,
                    "id": config.model_id,
                    "temperature": config.temperature,
                    "max_tokens": config.max_tokens,
                    "top_p": config.top_p,
                    "frequency_penalty": config.frequency_penalty,
                    "presence_penalty": config.presence_penalty,
                    "stop_sequences": list(config.stop_sequences) if config.stop_sequences else None,
                    "reasoning_effort": config.reasoning_effort,
                    "json_mode": config.json_mode,
                    "seed": config.seed,
                },
            "scorers": [
                    {
                        "type": s.type,
                        "weight": s.weight,
                        "threshold": s.threshold,
                        "is_primary": s.is_primary,
                    }
                    for s in config.scorers
                ] if config.scorers else [{"type": "exact_match", "weight": 1.0, "threshold": 0.8, "is_primary": True}],
                "notes": config.notes,
            },
        )

        self.session.add(version)
        await self.session.commit()
        await self.session.refresh(version)

        # Store main version id in Experiment.summary (no schema migration needed).
        if not (experiment.summary or {}).get("main_version_id"):
            experiment.summary = {**(experiment.summary or {}), "main_version_id": version.id}
            self.session.add(experiment)
            await self.session.commit()

        return version

    async def list_versions(self, experiment_id: str) -> list[ExperimentVersionModel]:
        stmt = select(ExperimentVersionModel).where(ExperimentVersionModel.experiment_id == experiment_id).order_by(
            ExperimentVersionModel.version_number.desc()
        )
        res = await self.session.execute(stmt)
        return res.scalars().all()

    async def set_main_version(self, experiment_id: str, version_id: str) -> ExperimentModel:
        experiment = await self.session.get(ExperimentModel, experiment_id)
        if not experiment:
            raise ValueError("Experiment not found")

        version = await self.session.get(ExperimentVersionModel, version_id)
        if not version or version.experiment_id != experiment_id:
            raise ValueError("Version not found")

        experiment.summary = {**(experiment.summary or {}), "main_version_id": version_id}
        self.session.add(experiment)
        await self.session.commit()
        await self.session.refresh(experiment)
        return experiment

    async def create_run(self, version_id: str) -> ExperimentRunModel:
        version = await self.session.get(ExperimentVersionModel, version_id)
        if not version:
            raise ValueError("Version not found")

        run = ExperimentRunModel(
            id=f"run_{uuid.uuid4().hex[:10]}",
            experiment_version_id=version_id,
            status="queued",
            summary={
                "rows_total": 0,
                "rows_done": 0,
                "rows_scored": 0,
                "avg_score": 0.0,
                "tokens_prompt": 0,
                "tokens_completion": 0,
                "tokens_total": 0,
                "cost_total": 0.0,
                "latency_ms_total": 0.0,
            },
        )
        self.session.add(run)
        await self.session.commit()
        await self.session.refresh(run)

        from app.services.job_service import JobService

        job_service = JobService(self.session)
        job = await job_service.create_job(kind="experiment_run", ref_id=run.id)
        run.summary = {**(run.summary or {}), "job_id": job.id}
        self.session.add(run)
        await self.session.commit()
        await self.session.refresh(run)
        return run

    async def list_runs_for_version(self, version_id: str) -> list[ExperimentRunModel]:
        stmt = select(ExperimentRunModel).where(ExperimentRunModel.experiment_version_id == version_id).order_by(
            ExperimentRunModel.created_at.desc()
        )
        res = await self.session.execute(stmt)
        return res.scalars().all()

    async def get_run(self, run_id: str) -> ExperimentRunModel:
        run = await self.session.get(ExperimentRunModel, run_id)
        if not run:
            raise ValueError("Run not found")
        return run

    async def cancel_run(self, run_id: str) -> ExperimentRunModel:
        run = await self.session.get(ExperimentRunModel, run_id)
        if not run:
            raise ValueError("Run not found")

        if run.status in {"completed", "error", "canceled"}:
            return run

        run.status = "canceled"
        run.cancel_requested_at = int(time.time() * 1000)
        self.session.add(run)
        await self.session.commit()
        await self.session.refresh(run)
        return run

    async def list_run_results(self, run_id: str) -> list[ExperimentRunResultModel]:
        stmt = select(ExperimentRunResultModel).where(ExperimentRunResultModel.run_id == run_id).order_by(
            ExperimentRunResultModel.created_at.asc()
        )
        res = await self.session.execute(stmt)
        return res.scalars().all()

    @staticmethod
    async def execute_run(run_id: str) -> None:
        """Compatibility entry point for the dedicated run executor."""
        await ExperimentRunExecutor.execute_run(run_id)
