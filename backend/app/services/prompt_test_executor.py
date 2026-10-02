from typing import Any, Dict, List, Optional
import logging
import time
import uuid

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.database import async_sessionmaker
from app.models import PromptTestModel, PromptTestResultModel, DatasetRowModel
from app.schemas.proxy import ChatCompletionRequest
from app.services.prompt_test_input import input_context_from_messages, messages_from_row_input
from app.services.proxy_service import ProxyService
from app.services.scorer_service import ScorerService

logger = logging.getLogger(__name__)


class PromptTestRowExecutor:
    def __init__(
        self,
        session: AsyncSession,
        prompt_test: PromptTestModel,
        proxy_service: ProxyService,
        scorer_service: ScorerService,
        scorers: list[dict[str, Any]],
        system_prompt: str,
        prompt_template: Optional[str],
        model_id: Optional[str],
        provider: str,
        parameters: Dict[str, Any],
    ):
        self.session = session
        self.prompt_test = prompt_test
        self.proxy_service = proxy_service
        self.scorer_service = scorer_service
        self.scorers = scorers
        self.system_prompt = system_prompt
        self.prompt_template = prompt_template
        self.model_id = model_id
        self.provider = provider
        self.parameters = parameters
        self.scored_values: Dict[str, List[float]] = {}

    async def execute_row(self, row: DatasetRowModel) -> None:
        trace_id = f"trace_pt_{self.prompt_test.id}_{row.id}_{uuid.uuid4().hex[:6]}"
        messages = messages_from_row_input(row.input, self.system_prompt, self.prompt_template)
        request_values = {
            "model": self.model_id,
            "provider": self.provider,
            "messages": messages,
            "stream": False,
            "trace_id": trace_id,
            **self.parameters,
        }
        request = ChatCompletionRequest(
            **{key: value for key, value in request_values.items() if value is not None}
        )
        output_payload, error_message, actual_text, latency_ms = await self._call_model(
            request,
            row.id,
        )

        input_context = input_context_from_messages(messages)
        scores = await self._score_output(row, actual_text, input_context)
        self._accumulate_scores(scores)
        await self._persist_result(
            row,
            output_payload,
            scores,
            latency_ms,
            error_message,
        )

    async def _call_model(
        self,
        request: ChatCompletionRequest,
        row_id: str,
    ) -> tuple[dict[str, Any], Optional[str], str, float]:
        error_message = None
        call_started = time.time()
        try:
            response = await self.proxy_service.chat_completion(
                request,
                project_id=self.prompt_test.project_id,
            )
            latency_ms = (time.time() - call_started) * 1000
            actual_text = ""
            if response.choices and response.choices[0].message and response.choices[0].message.content:
                actual_text = response.choices[0].message.content
            output_payload = response.model_dump(exclude_none=True)
            output_payload["output_text"] = actual_text
        except Exception as error:
            latency_ms = (time.time() - call_started) * 1000
            output_payload = {"error": str(error)}
            error_message = str(error)
            actual_text = ""
            logger.warning(
                "Prompt test model call failed for test %s and row %s (%s)",
                self.prompt_test.id,
                row_id,
                type(error).__name__,
            )
        return output_payload, error_message, actual_text, latency_ms

    async def _score_output(
        self,
        row: DatasetRowModel,
        actual_text: str,
        input_context: str,
    ) -> dict[str, Any]:
        if not actual_text:
            return {}
        return await self.scorer_service.run_scorers(
            scorers=self.scorers,
            expected=row.expected,
            actual_text=actual_text,
            input_text=input_context,
        )

    def _accumulate_scores(self, scores: dict[str, Any]) -> None:
        for name, value in scores.items():
            if name.endswith("_details") or not isinstance(value, (int, float)):
                continue
            self.scored_values.setdefault(name, []).append(float(value))

    async def _persist_result(
        self,
        row: DatasetRowModel,
        output_payload: dict[str, Any],
        scores: dict[str, Any],
        latency_ms: float,
        error_message: Optional[str],
    ) -> None:
        result = PromptTestResultModel(
            prompt_test_id=self.prompt_test.id,
            dataset_row_id=row.id,
            output=output_payload,
            scores=scores,
            latency_ms=latency_ms,
            error=error_message,
        )
        self.session.add(result)

        summary = self.prompt_test.summary or {}
        summary["rows_done"] = int(summary.get("rows_done", 0)) + 1
        self.prompt_test.summary = summary
        self.session.add(self.prompt_test)
        await self.session.commit()


async def execute_prompt_test(prompt_test_id: str):
    async with async_sessionmaker() as session:
        prompt_test = await session.get(PromptTestModel, prompt_test_id)
        if not prompt_test:
            return

        # Update status to running
        prompt_test.status = "running"
        prompt_test.started_at = int(time.time() * 1000)
        session.add(prompt_test)
        await session.commit()
        await session.refresh(prompt_test)

        try:
            # Get Config
            config = prompt_test.prompt_config or {}
            system_prompt = config.get("system_prompt", "")
            prompt_template = config.get("prompt_template", "")
            model_id = config.get("model_id")
            provider = config.get("provider", "openai")
            parameters = config.get("parameters", {})

            # Get Dataset Rows
            query = select(DatasetRowModel).where(
                DatasetRowModel.dataset_id == prompt_test.dataset_id
            ).where(DatasetRowModel.row_kind == "eval")
            rows = (await session.exec(query)).all()

            # Setup Services
            proxy_service = ProxyService(session)
            scorer_service = ScorerService(session, project_id=prompt_test.project_id)

            scorers_cfg = prompt_test.success_criteria or []
            row_executor = PromptTestRowExecutor(
                session=session,
                prompt_test=prompt_test,
                proxy_service=proxy_service,
                scorer_service=scorer_service,
                scorers=scorers_cfg,
                system_prompt=system_prompt,
                prompt_template=prompt_template,
                model_id=model_id,
                provider=provider,
                parameters=parameters,
            )

            # Processing loop
            for row in rows:
                # Reload test to check for cancellation
                await session.refresh(prompt_test)
                if prompt_test.status == "canceled":
                    break

                await row_executor.execute_row(row)

            # Finalize
            avg_scores = {
                name: sum(values) / len(values)
                for name, values in row_executor.scored_values.items()
                if values
            }
            summary = prompt_test.summary or {}
            summary.update(avg_scores)

            prompt_test.status = "completed"
            prompt_test.completed_at = int(time.time() * 1000)
            session.add(prompt_test)
            await session.commit()

        except Exception as error:
            logger.exception(
                "Prompt test %s failed (%s)",
                prompt_test_id,
                type(error).__name__,
            )
            prompt_test.status = "error"
            summary = prompt_test.summary or {}
            summary["error"] = str(error)
            prompt_test.summary = summary
            session.add(prompt_test)
            await session.commit()
