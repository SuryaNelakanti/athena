from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class LogCreate(BaseModel):
    """Single log entry to create."""

    project_id: str
    # Deprecated: level retained for backward compatibility.
    level: Optional[str] = None  # DEBUG, INFO, WARN, ERROR
    event_type: Optional[str] = None
    status: Optional[str] = None  # success | error
    message: str
    timestamp: Optional[int] = None  # Unix ms, defaults to now
    trace_id: Optional[str] = None
    span_id: Optional[str] = None
    attributes: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = None


class LogBatchCreate(BaseModel):
    """Batch of log entries to create."""

    logs: List[LogCreate]


class LogResponse(BaseModel):
    id: str
    project_id: str
    level: Optional[str] = None
    event_type: Optional[str] = None
    status: Optional[str] = None
    message: str
    timestamp: int
    trace_id: Optional[str] = None
    span_id: Optional[str] = None
    latency_ms: Optional[float] = None
    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int] = None
    total_tokens: Optional[int] = None
    cost: Optional[float] = None
    model: Optional[str] = None
    provider: Optional[str] = None
    attributes: Dict[str, Any] = Field(default_factory=dict)
    log_metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: int

    class Config:
        from_attributes = True


class LogBatchResponse(BaseModel):
    """Response for batch log creation."""

    status: str
    count: int
    log_ids: List[str]
