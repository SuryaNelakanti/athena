from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional
import time
import uuid

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.database import async_sessionmaker
from app.models import (
    DatasetModel,
    DatasetRowModel,
    ExperimentModel,
    ExperimentRunModel,
    ExperimentRunResultModel,
    ExperimentVersionModel,
    TraceModel,
)
from app.schemas.proxy import ChatCompletionRequest, ChatMessage
from app.services.proxy_service import ProxyService
from app.services.scorer_service import ScorerService


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
    stop_sequences: Optional[tuple] = None  # tuple for frozen dataclass
    # Prompt config
    system_prompt: str = ""
    prompt_template: Optional[str] = None
    # Advanced
    reasoning_effort: Optional[str] = None  # "low" | "medium" | "high"
    json_mode: Optional[bool] = None
    seed: Optional[int] = None
    # Scorers
    scorers: tuple = ("exact_match",)  # tuple for frozen dataclass
    # Metadata
    notes: str = ""


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
                "scorers": [{"type": s} for s in config.scorers],
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

    def _normalize_text(self, value: str) -> str:
        return " ".join(value.strip().lower().split())

    def _extract_expected_text(self, expected: Any) -> Optional[str]:
        if expected is None or expected == {}:
            return None
        if isinstance(expected, str):
            return expected
        if isinstance(expected, dict):
            for key in ("content", "answer", "text"):
                value = expected.get(key)
                if isinstance(value, str):
                    return value
            try:
                choices = expected.get("choices")
                if isinstance(choices, list) and choices:
                    message = choices[0].get("message", {})
                    content = message.get("content")
                    if isinstance(content, str):
                        return content
            except Exception:
                return None
        return None

    def _messages_from_row_input(self, row_input: Any, system_prompt: str) -> list[ChatMessage]:
        messages: list[ChatMessage] = []
        if system_prompt:
            messages.append(ChatMessage(role="system", content=system_prompt))

        if isinstance(row_input, dict):
            if isinstance(row_input.get("messages"), list):
                for m in row_input["messages"]:
                    if not isinstance(m, dict):
                        continue
                    role = m.get("role")
                    content = m.get("content")
                    if isinstance(role, str) and isinstance(content, str):
                        messages.append(ChatMessage(role=role, content=content))
                if messages:
                    return messages

            for key in ("prompt", "input", "text", "query"):
                value = row_input.get(key)
                if isinstance(value, str) and value.strip():
                    messages.append(ChatMessage(role="user", content=value))
                    return messages

        if isinstance(row_input, str) and row_input.strip():
            messages.append(ChatMessage(role="user", content=row_input))
            return messages

        messages.append(ChatMessage(role="user", content=""))
        return messages

    def _score_exact_match(self, expected_text: Optional[str], actual_text: str) -> Optional[float]:
        if expected_text is None:
            return None
        return 1.0 if self._normalize_text(expected_text) == self._normalize_text(actual_text) else 0.0

    @staticmethod
    async def execute_run(run_id: str) -> None:
        """
        Executes a run in-process asynchronously.

        TODO(queue): Move this to a real background queue/worker so runs survive server restarts.
        """
        async with async_sessionmaker() as session:
            service = ExperimentV2Service(session)
            run = await session.get(ExperimentRunModel, run_id)
            if not run:
                return

            if run.status in {"running", "completed", "error", "canceled"}:
                return

            version = await session.get(ExperimentVersionModel, run.experiment_version_id)
            if not version:
                run.status = "error"
                run.summary = {**(run.summary or {}), "error": "Version not found"}
                run.completed_at = int(time.time() * 1000)
                session.add(run)
                await session.commit()
                return

            experiment = await session.get(ExperimentModel, version.experiment_id)
            if not experiment:
                run.status = "error"
                run.summary = {**(run.summary or {}), "error": "Experiment not found"}
                run.completed_at = int(time.time() * 1000)
                session.add(run)
                await session.commit()
                return

            model_cfg = (version.config or {}).get("model", {})
            task_cfg = (version.config or {}).get("task", {})
            scorers_cfg = (version.config or {}).get("scorers", [{"type": "exact_match"}])
            system_prompt = str(task_cfg.get("system_prompt") or "")

            provider = str(model_cfg.get("provider") or "")
            model_id = str(model_cfg.get("id") or "")
            temperature = float(model_cfg.get("temperature") or 1.0)
            max_tokens = model_cfg.get("max_tokens")
            top_p = model_cfg.get("top_p")
            frequency_penalty = model_cfg.get("frequency_penalty")
            presence_penalty = model_cfg.get("presence_penalty")
            stop_sequences = model_cfg.get("stop_sequences")
            seed = model_cfg.get("seed")

            if not provider or not model_id:
                run.status = "error"
                run.summary = {**(run.summary or {}), "error": "Model config missing provider/id"}
                run.completed_at = int(time.time() * 1000)
                session.add(run)
                await session.commit()
                return

            from app.services.dataset_service import DatasetService
            dataset_service = DatasetService(session)
            rows = await dataset_service.list_rows(
                experiment.dataset_id,
                at_version=version.dataset_version_pinned,
                row_kind="eval",
            )

            run.status = "running"
            run.started_at = int(time.time() * 1000)
            run.summary = {**(run.summary or {}), "rows_total": len(rows)}
            session.add(run)
            await session.commit()

            proxy_service = ProxyService(session)
            scorer_service = ScorerService(session, project_id=experiment.project_id)
            scored_values: dict[str, list[float]] = {}  # Track per-scorer values for averaging


            for row in rows:
                # Best-effort cancel: stop processing future rows.
                await session.refresh(run)
                if run.status == "canceled":
                    break

                trace_id = f"trace_run_{run_id}_{row.id}_{uuid.uuid4().hex[:6]}"
                messages = service._messages_from_row_input(row.input, system_prompt)

                request = ChatCompletionRequest(
                    model=model_id,
                    provider=provider,
                    messages=messages,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    top_p=top_p,
                    frequency_penalty=frequency_penalty,
                    presence_penalty=presence_penalty,
                    stop=stop_sequences,
                    seed=seed,
                    stream=False,
                    trace_id=trace_id,
                )

                call_started = time.time()
                response = await proxy_service.chat_completion(request, project_id=experiment.project_id)
                call_latency_ms = (time.time() - call_started) * 1000

                actual_text = ""
                if response.choices and response.choices[0].message and response.choices[0].message.content:
                    actual_text = response.choices[0].message.content

                # Extract input text for LLM judge context
                input_text = ""
                if isinstance(row.input, dict):
                    for key in ("prompt", "input", "text", "query"):
                        if isinstance(row.input.get(key), str):
                            input_text = row.input[key]
                            break
                elif isinstance(row.input, str):
                    input_text = row.input

                # Run all configured scorers
                scores = await scorer_service.run_scorers(
                    scorers=scorers_cfg,
                    expected=row.expected,
                    actual_text=actual_text,
                    input_text=input_text
                )

                # Track scores for averaging (use first scorer for main avg_score)
                for scorer_name, score_value in scores.items():
                    if not scorer_name.endswith("_details") and isinstance(score_value, (int, float)):
                        if scorer_name not in scored_values:
                            scored_values[scorer_name] = []
                        scored_values[scorer_name].append(float(score_value))

                usage = response.usage
                prompt_tokens = int(getattr(usage, "prompt_tokens", 0) or 0)
                completion_tokens = int(getattr(usage, "completion_tokens", 0) or 0)
                total_tokens = int(getattr(usage, "total_tokens", 0) or 0)
                cost = float(getattr(usage, "cost", 0.0) or 0.0)

                latency_ms = float(getattr(usage, "latency_ms", 0.0) or call_latency_ms)

                output_payload = response.model_dump(exclude_none=True)
                output_payload["athena_trace_id"] = trace_id
                output_payload["output_text"] = actual_text

                result_model = ExperimentRunResultModel(
                    id=f"rr_{uuid.uuid4().hex[:10]}",
                    run_id=run_id,
                    dataset_row_id=row.id,
                    output=output_payload,
                    scores=scores,
                    latency_ms=latency_ms,
                )
                session.add(result_model)

                # Update progress + aggregates.
                summary = run.summary or {}
                rows_done = int(summary.get("rows_done", 0) or 0) + 1
                rows_scored = int(summary.get("rows_scored", 0) or 0) + (1 if scores else 0)
                tokens_prompt = int(summary.get("tokens_prompt", 0) or 0) + prompt_tokens
                tokens_completion = int(summary.get("tokens_completion", 0) or 0) + completion_tokens
                tokens_total = int(summary.get("tokens_total", 0) or 0) + total_tokens
                cost_total = float(summary.get("cost_total", 0.0) or 0.0) + cost
                latency_total = float(summary.get("latency_ms_total", 0.0) or 0.0) + latency_ms

                # Calculate avg_score from first scorer (primary metric)
                primary_scorer = scorers_cfg[0].get("type", "exact_match") if scorers_cfg else "exact_match"
                primary_scores = scored_values.get(primary_scorer, [])
                avg_score = float(sum(primary_scores) / len(primary_scores)) if primary_scores else 0.0

                # Also track per-scorer averages
                scorer_avgs = {}
                for scorer_name, values in scored_values.items():
                    if values:
                        scorer_avgs[f"avg_{scorer_name}"] = sum(values) / len(values)

                run.summary = {
                    **summary,
                    "rows_done": rows_done,
                    "rows_scored": rows_scored,
                    "avg_score": avg_score,
                    **scorer_avgs,
                    "tokens_prompt": tokens_prompt,
                    "tokens_completion": tokens_completion,
                    "tokens_total": tokens_total,
                    "cost_total": cost_total,
                    "latency_ms_total": latency_total,
                }

                session.add(run)
                await session.commit()

            await session.refresh(run)
            if run.status == "canceled":
                run.completed_at = int(time.time() * 1000)
                run.summary = {**(run.summary or {}), "status": "canceled"}
                session.add(run)
                await session.commit()
                return

            run.status = "completed"
            run.completed_at = int(time.time() * 1000)
            session.add(run)
            await session.commit()
