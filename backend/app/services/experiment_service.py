from __future__ import annotations

from dataclasses import dataclass
from typing import Optional
import time

from sqlalchemy import delete, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.models import DatasetRowModel, ExperimentModel, ExperimentResultModel
from app.services.legacy_experiment_row_executor import LegacyExperimentRowExecutor
from app.services.proxy_service import ProxyService


@dataclass(frozen=True)
class RunConfig:
    model: str
    provider: Optional[str] = None
    temperature: Optional[float] = 1.0
    max_tokens: Optional[int] = None
    system_prompt: Optional[str] = None
    clear_existing: bool = True


class ExperimentService:
    """Orchestrate the backwards-compatible experiment execution flow."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def run_experiment(self, experiment_id: str, config: RunConfig) -> ExperimentModel:
        experiment = await self._load_experiment(experiment_id)
        await self._clear_previous_results(experiment_id, config.clear_existing)
        rows = await self._load_evaluation_rows(experiment.dataset_id)
        await self._mark_running(experiment, config, len(rows))

        scored_values = await self._execute_rows(experiment, rows, config)
        return await self._mark_completed(experiment, scored_values)

    async def _load_experiment(self, experiment_id: str) -> ExperimentModel:
        experiment = await self.session.get(ExperimentModel, experiment_id)
        if not experiment:
            raise ValueError("Experiment not found")
        return experiment

    async def _clear_previous_results(self, experiment_id: str, should_clear: bool) -> None:
        if not should_clear:
            return
        await self.session.execute(
            delete(ExperimentResultModel).where(
                ExperimentResultModel.experiment_id == experiment_id
            )
        )
        await self.session.commit()

    async def _load_evaluation_rows(self, dataset_id: str) -> list[DatasetRowModel]:
        result = await self.session.execute(
            select(DatasetRowModel).where(
                DatasetRowModel.dataset_id == dataset_id,
                or_(
                    DatasetRowModel.row_kind == "eval",
                    DatasetRowModel.row_kind.is_(None),
                ),
            )
        )
        return list(result.scalars().all())

    async def _mark_running(
        self,
        experiment: ExperimentModel,
        config: RunConfig,
        row_count: int,
    ) -> None:
        experiment.status = "running"
        experiment.summary = {
            "model": config.model,
            "provider": config.provider,
            "scorer": "exact_match",
            "rows_total": row_count,
            "rows_scored": 0,
            "avg_score": 0.0,
            "started_at": int(time.time() * 1000),
        }
        self.session.add(experiment)
        await self.session.commit()

    async def _execute_rows(
        self,
        experiment: ExperimentModel,
        rows: list[DatasetRowModel],
        config: RunConfig,
    ) -> list[float]:
        executor = LegacyExperimentRowExecutor(self.session, ProxyService(self.session))
        scored_values: list[float] = []
        for row in rows:
            score = await executor.execute(experiment, row, config)
            if score is not None:
                scored_values.append(score)
        return scored_values

    async def _mark_completed(
        self,
        experiment: ExperimentModel,
        scored_values: list[float],
    ) -> ExperimentModel:
        experiment.status = "completed"
        experiment.summary = {
            **(experiment.summary or {}),
            "rows_scored": len(scored_values),
            "avg_score": float(sum(scored_values) / len(scored_values))
            if scored_values
            else 0.0,
            "completed_at": int(time.time() * 1000),
        }
        self.session.add(experiment)
        await self.session.commit()
        await self.session.refresh(experiment)
        return experiment
