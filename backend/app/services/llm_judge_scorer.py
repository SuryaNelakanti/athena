"""LLM-backed semantic scoring for experiment outputs."""

from __future__ import annotations

import logging
import re
from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.proxy import ChatCompletionRequest, ChatCompletionResponse, ChatMessage
from app.services.proxy_service import ProxyService
from app.services.scorer_result import ScorerResult

logger = logging.getLogger(__name__)


class LLMJudgeScorer:
    def __init__(self, session: Optional[AsyncSession], project_id: Optional[str]):
        self.session = session
        self.project_id = project_id

    async def score(
        self,
        expected_text: Optional[str],
        actual_text: str,
        input_text: str,
        config: Optional[dict] = None,
    ) -> ScorerResult:
        if not self.session:
            return ScorerResult(
                scorer_name="llm_judge",
                score=None,
                details={"error": "No session available for LLM judge"},
            )

        settings = config or {}
        model = settings.get("model", "gpt-4o-mini")
        provider = settings.get("provider", "openai")
        criteria = settings.get("criteria", "accuracy, relevance, and helpfulness")
        judge_prompt = self._build_prompt(
            expected_text=expected_text,
            actual_text=actual_text,
            input_text=input_text,
            criteria=criteria,
        )

        try:
            proxy_service = ProxyService(self.session)
            request = ChatCompletionRequest(
                model=model,
                provider=provider,
                messages=[ChatMessage(role="user", content=judge_prompt)],
                temperature=0.0,
                max_tokens=10,
                stream=False,
            )
            response = await proxy_service.chat_completion(request, project_id=self.project_id)
            return self._parse_response(
                response=response,
                model=model,
                provider=provider,
                criteria=criteria,
                judge_prompt=judge_prompt,
            )
        except Exception as error:
            logger.warning(
                "LLM judge failed for provider %s and model %s (%s)",
                provider,
                model,
                type(error).__name__,
            )
            return ScorerResult(
                scorer_name="llm_judge",
                score=None,
                details={"error": str(error)},
            )

    @staticmethod
    def _build_prompt(
        expected_text: Optional[str],
        actual_text: str,
        input_text: str,
        criteria: str,
    ) -> str:
        prompt = f"""You are an expert evaluator. Score the following AI response on a scale of 1-5 based on {criteria}.

INPUT/QUESTION:
{input_text}

"""
        if expected_text:
            prompt += f"""EXPECTED/REFERENCE ANSWER:
{expected_text}

"""
        prompt += f"""ACTUAL AI RESPONSE:
{actual_text}

Rate the response on a scale of 1-5 where:
1 = Very poor, completely wrong or irrelevant
2 = Poor, mostly incorrect or unhelpful
3 = Acceptable, partially correct or helpful
4 = Good, mostly correct and helpful
5 = Excellent, completely correct and very helpful

Respond with ONLY a single number (1, 2, 3, 4, or 5) and nothing else."""
        return prompt

    @staticmethod
    def _parse_response(
        response: ChatCompletionResponse,
        model: str,
        provider: str,
        criteria: str,
        judge_prompt: str,
    ) -> ScorerResult:
        if not response.choices or not response.choices[0].message:
            return ScorerResult(
                scorer_name="llm_judge",
                score=None,
                details={"error": "Could not parse LLM response"},
            )

        content = response.choices[0].message.content or ""
        numbers = re.findall(r"[1-5]", content)
        if not numbers:
            return ScorerResult(
                scorer_name="llm_judge",
                score=None,
                details={"error": "Could not parse LLM response"},
            )

        raw_score = int(numbers[0])
        details: dict[str, Any] = {
            "raw_score": raw_score,
            "model": model,
            "provider": provider,
            "criteria": criteria,
            "prompt": judge_prompt,
        }
        if response.usage:
            details["usage"] = response.usage.model_dump()
        if response.trace_id:
            details["trace_id"] = response.trace_id
        if response.span_id:
            details["span_id"] = response.span_id

        return ScorerResult(
            scorer_name="llm_judge",
            score=(raw_score - 1) / 4.0,
            details=details,
        )
