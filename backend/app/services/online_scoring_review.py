"""Create or refresh review items produced by online scoring."""

from __future__ import annotations

import time
import uuid
from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.models import LogModel, ReviewItemModel, SpanModel, TraceModel


def _truncate(text: str, max_len: int = 240) -> str:
    text = text.strip()
    if len(text) <= max_len:
        return text
    return text[: max_len - 3].rstrip() + "..."


class OnlineScoringReviewService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def upsert_for_score(
        self,
        log: LogModel,
        span: SpanModel,
        input_text: str,
        output_text: str,
        scores: dict[str, Any],
        primary_score: Optional[float],
        threshold: float,
        enabled: bool,
        updated_at: int,
    ) -> None:
        if not enabled or primary_score is None or primary_score >= threshold:
            return

        review_stmt = select(ReviewItemModel).where(
            ReviewItemModel.source_type == "log",
            ReviewItemModel.source_id == log.id,
        )
        review_result = await self.session.execute(review_stmt)
        review = review_result.scalar_one_or_none()

        trace_status = None
        if log.trace_id:
            trace = await self.session.get(TraceModel, log.trace_id)
            trace_status = trace.status if trace else None

        model = log.model
        provider = log.provider
        if isinstance(span.attributes, dict):
            model = model or span.attributes.get("model")
            provider = provider or span.attributes.get("provider")

        review_metadata = {
            "trace_id": log.trace_id,
            "span_id": log.span_id,
            "trace_status": trace_status,
            "input_preview": _truncate(input_text),
            "output_preview": _truncate(output_text),
            "model": model,
            "provider": provider,
            "scores": scores,
        }

        if review:
            review.score = primary_score
            review.meta = review_metadata
            review.updated_at = updated_at
        else:
            review = ReviewItemModel(
                id=f"rev_{uuid.uuid4().hex[:10]}",
                org_id=None,
                project_id=log.project_id,
                source_type="log",
                source_id=log.id,
                status="open",
                priority=0,
                labels=["online_score"],
                score=primary_score,
                meta=review_metadata,
                created_at=updated_at,
                updated_at=updated_at,
            )
        self.session.add(review)
