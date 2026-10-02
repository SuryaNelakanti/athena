from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from app.models import SpanType


class IngestSpan(BaseModel):
    id: str
    parent_id: Optional[str] = None
    name: str
    type: SpanType
    start_time: int
    end_time: int
    status: str
    input: Optional[Dict[str, Any]] = None
    output: Optional[Dict[str, Any]] = None
    metrics: Optional[Dict[str, Any]] = None
    attributes: Optional[Dict[str, Any]] = None
    tags: List[str] = Field(default_factory=list)
    error_message: Optional[str] = None


class IngestTrace(BaseModel):
    trace_id: str
    parent_trace_id: Optional[str] = None
    trace_group_id: Optional[str] = None
    input_span_id: Optional[str] = None
    output_span_id: Optional[str] = None
    timestamp: int
    total_latency: Optional[float] = 0.0
    total_cost: Optional[float] = 0.0
    total_tokens: Optional[int] = 0
    status: str = "success"
    tags: List[str] = Field(default_factory=list)
    spans: List[IngestSpan]


class IngestRun(BaseModel):
    run_id: Optional[str] = None
    trace: IngestTrace
    status: Optional[str] = None
    started_at: Optional[int] = None
    ended_at: Optional[int] = None
    tags: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class IngestEvent(BaseModel):
    event_type: str
    timestamp: int
    run_id: Optional[str] = None
    sequence: Optional[int] = None
    payload: Dict[str, Any] = Field(default_factory=dict)


class IngestSession(BaseModel):
    session_id: Optional[str] = None
    project_id: str
    agent_name: Optional[str] = None
    env: Optional[str] = None
    started_at: Optional[int] = None
    tags: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    runs: List[IngestRun] = Field(default_factory=list)
    events: List[IngestEvent] = Field(default_factory=list)


class SessionIngestRequest(BaseModel):
    schema_version: str = "v0"
    session: IngestSession


class SessionIngestResponse(BaseModel):
    status: str
    session_id: str
    run_ids: List[str]
    trace_ids: List[str]
    event_count: int
