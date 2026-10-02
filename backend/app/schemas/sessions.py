from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from app.models import RunReplayModel


class AgentSessionResponse(BaseModel):
    id: str
    project_id: str
    agent_name: Optional[str] = None
    env: Optional[str] = None
    status: str
    tags: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: int
    updated_at: int
    last_run_at: Optional[int] = None
    run_count: int = 0
    error_count: int = 0
    total_cost: float = 0.0
    total_latency: float = 0.0
    total_tokens: int = 0
    last_status: Optional[str] = None
    last_run_id: Optional[str] = None

    class Config:
        from_attributes = True


class AgentRunResponse(BaseModel):
    id: str
    session_id: str
    project_id: str
    trace_id: Optional[str] = None
    status: str
    started_at: int
    ended_at: Optional[int] = None
    total_tokens: Optional[int] = None
    total_cost: Optional[float] = None
    total_latency: Optional[float] = None
    tags: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: int

    class Config:
        from_attributes = True


class AgentSessionDetailResponse(BaseModel):
    session: AgentSessionResponse
    runs: List[AgentRunResponse]


class SessionEventResponse(BaseModel):
    id: str
    session_id: str
    run_id: Optional[str] = None
    sequence: int
    event_type: str
    timestamp: int
    payload: Dict[str, Any] = Field(default_factory=dict)

    class Config:
        from_attributes = True


class SessionAnnotationResponse(BaseModel):
    id: str
    session_id: str
    project_id: str
    labels: List[str] = Field(default_factory=list)
    severity: Optional[str] = None
    owner: Optional[str] = None
    status: str
    note: Optional[str] = None
    created_at: int
    updated_at: int

    class Config:
        from_attributes = True


class SessionAnnotationCreate(BaseModel):
    labels: List[str] = Field(default_factory=list)
    severity: Optional[str] = None
    owner: Optional[str] = None
    status: str = "open"
    note: Optional[str] = None


class SessionAnnotationUpdate(BaseModel):
    labels: Optional[List[str]] = None
    severity: Optional[str] = None
    owner: Optional[str] = None
    status: Optional[str] = None
    note: Optional[str] = None


class SessionEvalCreate(BaseModel):
    run_id: Optional[str] = None
    scorers: Optional[List[Dict[str, Any]]] = None
    expected: Optional[Any] = None
    input: Optional[Any] = None
    rubric: Optional[Dict[str, Any]] = None


class SessionEvalResponse(BaseModel):
    id: str
    session_id: str
    project_id: str
    run_id: Optional[str] = None
    version: int
    rubric: Dict[str, Any] = Field(default_factory=dict)
    scorers: List[Dict[str, Any]] = Field(default_factory=list)
    scores: Dict[str, Any] = Field(default_factory=dict)
    summary: Dict[str, Any] = Field(default_factory=dict)
    created_at: int

    class Config:
        from_attributes = True


class CausalChainNode(BaseModel):
    id: str
    name: str
    status: str


class RunGraphNode(BaseModel):
    id: str
    span_id: str
    name: str
    kind: str
    status: str
    start_time: int
    end_time: int
    duration_ms: float
    depth: int
    lane: int
    parent_id: Optional[str] = None
    retry_parent_id: Optional[str] = None
    input: Dict[str, Any] = Field(default_factory=dict)
    output: Dict[str, Any] = Field(default_factory=dict)
    attributes: Dict[str, Any] = Field(default_factory=dict)
    metrics: Dict[str, Any] = Field(default_factory=dict)
    tags: List[str] = Field(default_factory=list)
    error_message: Optional[str] = None
    causal_chain: List[CausalChainNode] = Field(default_factory=list)


class RunGraphEdge(BaseModel):
    from_id: str
    to_id: str
    kind: str = "parent"


class RunGraphResponse(BaseModel):
    run_id: str
    trace_id: str
    root_id: str
    nodes: List[RunGraphNode]
    edges: List[RunGraphEdge]
    layout: Dict[str, Any] = Field(default_factory=dict)


class ReplayRunResponse(BaseModel):
    replay: RunReplayModel
    run: AgentRunResponse


class RunCompareResponse(BaseModel):
    baseline_run_id: str
    candidate_run_id: str
    summary: Dict[str, Any]
    nodes_added: List[str] = Field(default_factory=list)
    nodes_removed: List[str] = Field(default_factory=list)
    nodes_changed: List[Dict[str, Any]] = Field(default_factory=list)
