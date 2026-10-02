"""Execute and persist one row for the legacy experiment endpoint."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Optional
import time
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import DatasetRowModel, ExperimentModel, ExperimentResultModel
from app.schemas.proxy import ChatCompletionRequest
from app.services.deterministic_scorers import score_exact_match
from app.services.experiment_input import messages_from_row_input
from app.services.proxy_service import ProxyService

if TYPE_CHECKING:
    from app.services.experiment_service import RunConfig


class LegacyExperimentRowExecutor:
    def __init__(self, session: AsyncSession, proxy: ProxyService):
        self.session = session
        self.proxy = proxy

    async def execute(
        self,
        experiment: ExperimentModel,
        row: DatasetRowModel,
        config: RunConfig,
    ) -> Optional[float]:
        trace_id = f"trace_exp_{experiment.id}_{row.id}_{uuid.uuid4().hex[:8]}"
        request = ChatCompletionRequest(
            model=config.model,
            provider=config.provider,
            messages=messages_from_row_input(row.input, config.system_prompt),
            temperature=config.temperature,
            max_tokens=config.max_tokens,
            stream=False,
            trace_id=trace_id,
        )

        call_started = time.time()
        response = await self.proxy.chat_completion(
            request,
            project_id=experiment.project_id,
        )
        call_latency_ms = (time.time() - call_started) * 1000

        actual_text = self._actual_text(response)
        expected_text = self._extract_expected_text(row.expected)
        exact_match = self._score_exact_match(expected_text, actual_text)
        scores: dict[str, Any] = {}
        if exact_match is not None:
            scores["exact_match"] = exact_match

        output_payload = response.model_dump(exclude_none=True)
        output_payload["athena_trace_id"] = trace_id
        output_payload["output_text"] = actual_text
        result_model = ExperimentResultModel(
            id=f"er_{uuid.uuid4().hex[:8]}",
            experiment_id=experiment.id,
            dataset_row_id=row.id,
            output=output_payload,
            scores=scores,
            latency_ms=float(
                getattr(response.usage, "latency_ms", 0.0) or call_latency_ms
            ),
        )
        self.session.add(result_model)
        await self.session.commit()
        return exact_match

    def _actual_text(self, response: Any) -> str:
        if not response.choices:
            return ""
        message = response.choices[0].message
        return message.content or "" if message else ""

    def _extract_expected_text(self, expected: Any) -> Optional[str]:
        if expected is None or expected == {}:
            return None
        if isinstance(expected, str):
            return expected
        if not isinstance(expected, dict):
            return None

        for key in ("content", "answer", "text"):
            value = expected.get(key)
            if isinstance(value, str):
                return value

        choices = expected.get("choices")
        if not isinstance(choices, list) or not choices:
            return None
        first_choice = choices[0]
        if not isinstance(first_choice, dict):
            return None
        message = first_choice.get("message")
        if not isinstance(message, dict):
            return None
        content = message.get("content")
        return content if isinstance(content, str) else None

    def _score_exact_match(
        self,
        expected_text: Optional[str],
        actual_text: str,
    ) -> Optional[float]:
        return score_exact_match(expected_text, actual_text).score
