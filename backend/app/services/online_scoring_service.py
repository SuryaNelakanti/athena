from __future__ import annotations

from typing import Any, Optional
import time
import uuid

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.database import async_sessionmaker
from app.models import LogModel, SpanModel, TraceModel, ReviewItemModel
from app.services.scorer_service import ScorerService


DEFAULT_SCORERS = [{"type": "anti_pattern_check"}]
DEFAULT_REVIEW_THRESHOLD = 0.7


def _truncate(text: str, max_len: int = 240) -> str:
    text = text.strip()
    if len(text) <= max_len:
        return text
    return text[: max_len - 3].rstrip() + "..."


def _extract_input_text(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        messages = value.get("messages")
        if isinstance(messages, list) and messages:
            for msg in reversed(messages):
                if isinstance(msg, dict) and msg.get("role") == "user":
                    content = msg.get("content")
                    if isinstance(content, str):
                        return content
            for msg in messages:
                if isinstance(msg, dict):
                    content = msg.get("content")
                    if isinstance(content, str):
                        return content
        for key in ("prompt", "input", "text", "query", "content"):
            if isinstance(value.get(key), str):
                return value[key]
    return ""


def _extract_output_text(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        for key in ("output_text", "content", "text"):
            if isinstance(value.get(key), str):
                return value[key]
        choices = value.get("choices")
        if isinstance(choices, list) and choices:
            first = choices[0]
            if isinstance(first, dict):
                message = first.get("message")
                if isinstance(message, dict) and isinstance(message.get("content"), str):
                    return message["content"]
                if isinstance(first.get("text"), str):
                    return first["text"]
        message = value.get("message")
        if isinstance(message, dict) and isinstance(message.get("content"), str):
            return message["content"]
    return "" if value is None else str(value)


def _normalize_scorers(raw: Any) -> list[dict]:
    if not raw:
        return [dict(item) for item in DEFAULT_SCORERS]
    if isinstance(raw, dict) and raw.get("type"):
        return [raw]
    if not isinstance(raw, list):
        return [dict(item) for item in DEFAULT_SCORERS]
    normalized: list[dict] = []
    for item in raw:
        if isinstance(item, str):
            normalized.append({"type": item})
        elif isinstance(item, dict) and item.get("type"):
            normalized.append(item)
    return normalized or [dict(item) for item in DEFAULT_SCORERS]


def _pick_primary_score(scores: dict, scorers_cfg: list[dict]) -> Optional[float]:
    for scorer in scorers_cfg:
        name = scorer.get("type")
        value = scores.get(name)
        if isinstance(value, (int, float)):
            return float(value)
    for key, value in scores.items():
        if key.endswith("_details"):
            continue
        if isinstance(value, (int, float)):
            return float(value)
    return None


class OnlineScoringService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def score_log(self, log_id: str) -> Optional[dict]:
        log = await self.session.get(LogModel, log_id)
        if not log:
            return None

        metadata = log.log_metadata or {}
        config_raw = metadata.get("online_scoring")
        config = config_raw if isinstance(config_raw, dict) else {}
        if config.get("enabled") is False:
            return None

        result = config.get("result") if isinstance(config.get("result"), dict) else {}
        if result.get("scored_at") and not config.get("force"):
            return result

        span: Optional[SpanModel] = None
        root_span: Optional[SpanModel] = None
        if log.span_id:
            span = await self.session.get(SpanModel, log.span_id)
        if not span and log.trace_id:
            stmt = select(SpanModel).where(SpanModel.trace_id == log.trace_id).order_by(SpanModel.start_time.asc())
            res = await self.session.execute(stmt)
            spans = res.scalars().all()
            if spans:
                root_span = spans[0]
                span = spans[-1]
        if not span:
            return None

        if not root_span:
            root_span = span

        input_text = _extract_input_text(root_span.input)
        output_text = _extract_output_text(span.output)
        if not output_text:
            return None

        scorers_cfg = _normalize_scorers(config.get("scorers"))
        threshold = float(config.get("review_threshold", DEFAULT_REVIEW_THRESHOLD))
        create_review = bool(config.get("create_review", True))
        expected = config.get("expected")

        scorer_service = ScorerService(self.session, project_id=log.project_id)
        scores = await scorer_service.run_scorers(
            scorers=scorers_cfg,
            expected=expected,
            actual_text=output_text,
            input_text=input_text,
        )

        primary_score = _pick_primary_score(scores, scorers_cfg)
        now_ms = int(time.time() * 1000)
        result_payload = {
            "scores": scores,
            "primary_score": primary_score,
            "threshold": threshold,
            "scored_at": now_ms,
        }

        config["scorers"] = scorers_cfg
        config["result"] = result_payload
        metadata["online_scoring"] = config
        log.log_metadata = metadata
        self.session.add(log)

        if create_review and primary_score is not None and primary_score < threshold:
            review_stmt = select(ReviewItemModel).where(
                ReviewItemModel.source_type == "log",
                ReviewItemModel.source_id == log.id,
            )
            review_res = await self.session.execute(review_stmt)
            review = review_res.scalar_one_or_none()

            trace_status = None
            if log.trace_id:
                trace = await self.session.get(TraceModel, log.trace_id)
                trace_status = trace.status if trace else None

            input_preview = _truncate(input_text)
            output_preview = _truncate(output_text)
            model = log.model
            provider = log.provider
            if isinstance(span.attributes, dict):
                model = model or span.attributes.get("model")
                provider = provider or span.attributes.get("provider")

            review_meta = {
                "trace_id": log.trace_id,
                "span_id": log.span_id,
                "trace_status": trace_status,
                "input_preview": input_preview,
                "output_preview": output_preview,
                "model": model,
                "provider": provider,
                "scores": scores,
            }

            if review:
                review.score = primary_score
                review.meta = review_meta
                review.updated_at = now_ms
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
                    meta=review_meta,
                    created_at=now_ms,
                    updated_at=now_ms,
                )
            self.session.add(review)

        await self.session.commit()
        await self.session.refresh(log)
        return result_payload

    @staticmethod
    async def execute_log_scoring(log_id: str) -> None:
        async with async_sessionmaker() as session:
            service = OnlineScoringService(session)
            await service.score_log(log_id)
