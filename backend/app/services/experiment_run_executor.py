"""Execute experiment runs and persist their row-level results."""

from __future__ import annotations

from dataclasses import dataclass
import time
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_sessionmaker
from app.models import (
    DatasetRowModel,
    ExperimentModel,
    ExperimentRunModel,
    ExperimentRunResultModel,
    ExperimentVersionModel,
)
from app.schemas.proxy import ChatCompletionRequest, ChatMessage
from app.services.dataset_service import DatasetService
from app.services.experiment_input import messages_from_row_input
from app.services.experiment_run_config import (
    ExperimentRunConfig,
    ExperimentRunConfigurationError,
)
from app.services.experiment_run_summary import ExperimentRunSummary
from app.services.proxy_service import ProxyService
from app.services.scorer_service import ScorerService


@dataclass
class PreparedExperimentRun:
    run: ExperimentRunModel
    experiment: ExperimentModel
    config: ExperimentRunConfig


class ExperimentRunExecutor:
    """Own the execution lifecycle for queued experiment runs."""

    @staticmethod
    def _input_context_from_messages(messages: list[ChatMessage]) -> str:
        parts = []
        for message in messages:
            role = message.role or "user"
            content = message.content or ""
            parts.append(f"{role.upper()}: {content}")
        return "\n".join(parts).strip()

    @staticmethod
    async def _fail_run(session: AsyncSession, run: ExperimentRunModel, message: str) -> None:
        run.status = "error"
        run.summary = {**(run.summary or {}), "error": message}
        run.completed_at = int(time.time() * 1000)
        session.add(run)
        await session.commit()

    @staticmethod
    async def execute_run(run_id: str) -> None:
        """Execute one queued run using a dedicated database session."""
        async with async_sessionmaker() as session:
            prepared = await ExperimentRunExecutor._prepare_run(session, run_id)
            if not prepared:
                return

            rows = await DatasetService(session).list_rows(
                prepared.experiment.dataset_id,
                at_version=prepared.run.dataset_version_pinned,
                row_kind="eval",
            )
            await ExperimentRunExecutor._mark_run_started(session, prepared.run, len(rows))
            await ExperimentRunExecutor._execute_rows(session, prepared, rows)
            await ExperimentRunExecutor._finish_run(session, prepared.run)

    @staticmethod
    async def _prepare_run(
        session: AsyncSession,
        run_id: str,
    ) -> PreparedExperimentRun | None:
        run = await session.get(ExperimentRunModel, run_id)
        if not run or run.status in {"running", "completed", "error", "canceled"}:
            return None

        version = await session.get(ExperimentVersionModel, run.experiment_version_id)
        if not version:
            await ExperimentRunExecutor._fail_run(session, run, "Version not found")
            return None

        experiment = await session.get(ExperimentModel, version.experiment_id)
        if not experiment:
            await ExperimentRunExecutor._fail_run(session, run, "Experiment not found")
            return None

        try:
            config = ExperimentRunConfig.from_version_config(version.config)
        except ExperimentRunConfigurationError as error:
            await ExperimentRunExecutor._fail_run(session, run, str(error))
            return None
        return PreparedExperimentRun(run=run, experiment=experiment, config=config)

    @staticmethod
    async def _mark_run_started(
        session: AsyncSession,
        run: ExperimentRunModel,
        row_count: int,
    ) -> None:
        run.status = "running"
        run.started_at = int(time.time() * 1000)
        run.summary = {**(run.summary or {}), "rows_total": row_count}
        session.add(run)
        await session.commit()

    @staticmethod
    async def _execute_rows(
        session: AsyncSession,
        prepared: PreparedExperimentRun,
        rows: list[DatasetRowModel],
    ) -> None:
        proxy_service = ProxyService(session)
        scorer_service = ScorerService(session, project_id=prepared.experiment.project_id)
        summary = ExperimentRunSummary(prepared.config.scorers)

        for row in rows:
            await session.refresh(prepared.run)
            if prepared.run.status == "canceled":
                break
            await ExperimentRunExecutor._execute_row(
                session,
                prepared,
                row,
                proxy_service,
                scorer_service,
                summary,
            )

    @staticmethod
    async def _execute_row(
        session: AsyncSession,
        prepared: PreparedExperimentRun,
        row: DatasetRowModel,
        proxy_service: ProxyService,
        scorer_service: ScorerService,
        summary: ExperimentRunSummary,
    ) -> None:
        config = prepared.config
        trace_id = (
            f"trace_run_{prepared.run.id}_{row.id}_{uuid.uuid4().hex[:6]}"
        )
        messages = messages_from_row_input(
            row.input,
            config.system_prompt,
            config.prompt_template,
        )
        request = ChatCompletionRequest(
            model=config.model_id,
            provider=config.provider,
            messages=messages,
            temperature=config.temperature,
            max_tokens=config.max_tokens,
            top_p=config.top_p,
            frequency_penalty=config.frequency_penalty,
            presence_penalty=config.presence_penalty,
            stop=config.stop_sequences,
            seed=config.seed,
            stream=False,
            trace_id=trace_id,
        )

        call_started = time.time()
        response = await proxy_service.chat_completion(
            request,
            project_id=prepared.experiment.project_id,
        )
        call_latency_ms = (time.time() - call_started) * 1000
        actual_text = ""
        if response.choices and response.choices[0].message and response.choices[0].message.content:
            actual_text = response.choices[0].message.content

        scores = await scorer_service.run_scorers(
            scorers=config.scorers,
            expected=row.expected,
            actual_text=actual_text,
            input_text=ExperimentRunExecutor._input_context_from_messages(messages),
        )
        usage = response.usage
        latency_ms = float(getattr(usage, "latency_ms", 0.0) or call_latency_ms)
        output_payload = response.model_dump(exclude_none=True)
        output_payload["athena_trace_id"] = trace_id
        output_payload["output_text"] = actual_text

        session.add(
            ExperimentRunResultModel(
                id=f"rr_{uuid.uuid4().hex[:10]}",
                run_id=prepared.run.id,
                dataset_row_id=row.id,
                output=output_payload,
                scores=scores,
                latency_ms=latency_ms,
            )
        )
        summary.add_result(prepared.run, scores, usage, latency_ms)
        session.add(prepared.run)
        await session.commit()

    @staticmethod
    async def _finish_run(
        session: AsyncSession,
        run: ExperimentRunModel,
    ) -> None:
        await session.refresh(run)
        if run.status == "canceled":
            run.completed_at = int(time.time() * 1000)
            run.summary = {**(run.summary or {}), "status": "canceled"}
        else:
            run.status = "completed"
            run.completed_at = int(time.time() * 1000)
        session.add(run)
        await session.commit()
