"""Normalize, persist, and schedule scoring for ingested logs."""

from __future__ import annotations

import logging
import time
import uuid
from typing import Any, Dict, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import LogModel
from app.schemas.logs import LogCreate
from app.services.job_service import JobService

logger = logging.getLogger(__name__)
_VALID_LEVELS = ("DEBUG", "INFO", "WARN", "ERROR")


class LogInputError(ValueError):
    """Raised when a log's legacy level or status fields are invalid."""


def normalize_log_status(status: Optional[str], level: Optional[str]) -> str:
    if status:
        normalized = status.lower().strip()
        if normalized not in {"success", "error"}:
            raise LogInputError("Invalid status. Must be success or error.")
        return normalized
    if level and level.upper() == "ERROR":
        return "error"
    return "success"


def _normalize_log_level(level: Optional[str], status: str) -> str:
    if level:
        return level.upper()
    return "ERROR" if status == "error" else "INFO"


def _validate_level(level: str, original_level: Optional[str], *, batch: bool) -> None:
    if level in _VALID_LEVELS:
        return
    if batch:
        message = f"Invalid log level '{original_level}'. Must be one of: {list(_VALID_LEVELS)}"
    else:
        # Keep the single-ingest response's established level list ordering.
        message = "Invalid log level. Must be one of: ['DEBUG', 'INFO', 'WARN', 'ERROR']"
    raise LogInputError(message)


def should_enqueue_score(
    trace_id: Optional[str],
    span_id: Optional[str],
    metadata: Optional[Dict[str, Any]],
) -> bool:
    if not trace_id and not span_id:
        return False
    if isinstance(metadata, dict):
        config = metadata.get("online_scoring")
        if isinstance(config, dict) and config.get("enabled") is False:
            return False
    return True


def _build_log_record(log: LogCreate, log_id: str, now_ms: int, *, batch: bool) -> LogModel:
    status = normalize_log_status(log.status, log.level)
    level = _normalize_log_level(log.level, status)
    _validate_level(level, log.level, batch=batch)
    event_type = (log.event_type or "custom").strip() or "custom"
    return LogModel(
        id=log_id,
        project_id=log.project_id,
        level=level,
        event_type=event_type,
        status=status,
        message=log.message,
        timestamp=log.timestamp or now_ms,
        trace_id=log.trace_id,
        span_id=log.span_id,
        attributes=log.attributes or {},
        log_metadata=log.metadata or {},
        created_at=now_ms,
    )


class LogIngestionService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create_log(self, payload: LogCreate) -> LogModel:
        now_ms = int(time.time() * 1000)
        log = _build_log_record(
            payload,
            f"log_{uuid.uuid4().hex[:16]}",
            now_ms,
            batch=False,
        )
        self.session.add(log)
        await self.session.commit()
        await self.session.refresh(log)
        await self._enqueue_score(log)
        return log

    async def create_logs_batch(self, payloads: list[LogCreate]) -> list[LogModel]:
        now_ms = int(time.time() * 1000)
        logs = [
            _build_log_record(
                payload,
                f"log_{uuid.uuid4().hex[:16]}",
                now_ms,
                batch=True,
            )
            for payload in payloads
        ]
        self.session.add_all(logs)
        await self.session.commit()
        for log in logs:
            await self._enqueue_score(log)
        return logs

    async def _enqueue_score(self, log: LogModel) -> None:
        if not should_enqueue_score(log.trace_id, log.span_id, log.log_metadata):
            return
        try:
            await JobService(self.session).create_job(
                kind="log_score",
                ref_id=log.id,
                payload={"source": "logs"},
            )
        except Exception as error:
            logger.warning(
                "Failed to enqueue score for log %s (%s)",
                log.id,
                type(error).__name__,
            )
