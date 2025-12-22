from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional, Tuple
import time
import uuid

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete, or_
from sqlmodel import select

from app.models import DatasetRowModel, ExperimentModel, ExperimentResultModel
from app.schemas.proxy import ChatCompletionRequest, ChatMessage
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
    def __init__(self, session: AsyncSession):
        self.session = session

    def _normalize_text(self, value: str) -> str:
        return " ".join(value.strip().lower().split())

    def _extract_expected_text(self, expected: Any) -> Optional[str]:
        if expected is None:
            return None
        if expected == {}:
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

    def _messages_from_row_input(self, row_input: Any, system_prompt: Optional[str]) -> list[ChatMessage]:
        messages: list[ChatMessage] = []
        if system_prompt:
            messages.append(ChatMessage(role="system", content=system_prompt))

        if isinstance(row_input, dict):
            if isinstance(row_input.get("messages"), list):
                for message in row_input["messages"]:
                    if not isinstance(message, dict):
                        continue
                    role = message.get("role")
                    content = message.get("content")
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

    async def run_experiment(self, experiment_id: str, config: RunConfig) -> ExperimentModel:
        experiment = await self.session.get(ExperimentModel, experiment_id)
        if not experiment:
            raise ValueError("Experiment not found")

        if config.clear_existing:
            await self.session.execute(
                delete(ExperimentResultModel).where(ExperimentResultModel.experiment_id == experiment_id)
            )
            await self.session.commit()

        rows_result = await self.session.execute(
            select(DatasetRowModel).where(
                DatasetRowModel.dataset_id == experiment.dataset_id,
                or_(
                    DatasetRowModel.row_kind == "eval",
                    DatasetRowModel.row_kind.is_(None),
                ),
            )
        )
        rows = rows_result.scalars().all()

        started_at = int(time.time() * 1000)
        experiment.status = "running"
        experiment.summary = {
            "model": config.model,
            "provider": config.provider,
            "scorer": "exact_match",
            "rows_total": len(rows),
            "rows_scored": 0,
            "avg_score": 0.0,
            "started_at": started_at,
        }
        self.session.add(experiment)
        await self.session.commit()

        proxy_service = ProxyService(self.session)
        scored_values: list[float] = []
        rows_scored = 0

        for row in rows:
            trace_id = f"trace_exp_{experiment_id}_{row.id}_{uuid.uuid4().hex[:8]}"
            messages = self._messages_from_row_input(row.input, config.system_prompt)

            request = ChatCompletionRequest(
                model=config.model,
                provider=config.provider,
                messages=messages,
                temperature=config.temperature,
                max_tokens=config.max_tokens,
                stream=False,
                trace_id=trace_id,
            )

            call_started = time.time()
            response = await proxy_service.chat_completion(request, project_id=experiment.project_id)
            call_latency_ms = (time.time() - call_started) * 1000

            actual_text = ""
            if response.choices and response.choices[0].message and response.choices[0].message.content:
                actual_text = response.choices[0].message.content

            expected_text = self._extract_expected_text(row.expected)
            exact_match = self._score_exact_match(expected_text, actual_text)
            scores: dict[str, Any] = {}
            if exact_match is not None:
                scores["exact_match"] = exact_match
                scored_values.append(exact_match)
                rows_scored += 1

            output_payload = response.model_dump(exclude_none=True)
            output_payload["athena_trace_id"] = trace_id
            output_payload["output_text"] = actual_text

            result_model = ExperimentResultModel(
                id=f"er_{uuid.uuid4().hex[:8]}",
                experiment_id=experiment_id,
                dataset_row_id=row.id,
                output=output_payload,
                scores=scores,
                latency_ms=float(getattr(response.usage, "latency_ms", 0.0) or call_latency_ms),
            )
            self.session.add(result_model)
            await self.session.commit()

        completed_at = int(time.time() * 1000)
        avg_score = float(sum(scored_values) / len(scored_values)) if scored_values else 0.0

        experiment.status = "completed"
        experiment.summary = {
            **(experiment.summary or {}),
            "rows_scored": rows_scored,
            "avg_score": avg_score,
            "completed_at": completed_at,
        }
        self.session.add(experiment)
        await self.session.commit()
        await self.session.refresh(experiment)
        return experiment
