from typing import List, Optional, Any, Dict, Union
from enum import Enum
from pydantic import BaseModel, Field

class Project(BaseModel):
    id: str
    name: str
    org_id: str

class SpanType(str, Enum):
    LLM = 'llm'
    TOOL = 'tool'
    CHAIN = 'chain'
    RETRIEVER = 'retriever'

class SpanMetrics(BaseModel):
    prompt_tokens: Optional[int] = 0
    completion_tokens: Optional[int] = 0
    total_tokens: Optional[int] = 0
    cost: Optional[float] = 0.0
    latency_ms: float

class SpanAttributes(BaseModel):
    model: Optional[str] = None
    provider: Optional[str] = None
    temperature: Optional[float] = None
    reasoning_effort: Optional[str] = None
    reasoning_enabled: Optional[bool] = None
    reasoning_delta: Optional[bool] = None
    reasoning_step_ids: Optional[List[str]] = None
    
    class Config:
        extra = "allow"

class Span(BaseModel):
    id: str
    trace_id: str
    parent_id: Optional[str] = None
    name: str
    type: SpanType
    start_time: int = Field(..., description="Unix timestamp ms")
    end_time: int = Field(..., description="Unix timestamp ms")
    status: str # 'success' | 'error'
    input: Any
    output: Any
    metrics: SpanMetrics
    attributes: SpanAttributes = Field(default_factory=dict)
    tags: List[str] = []
    error_message: Optional[str] = None

class Trace(BaseModel):
    id: str
    root_span: Span
    spans: List[Span]
    project_id: str
    timestamp: int
    total_latency: float
    total_cost: float
    total_tokens: int
    status: str
    tags: List[str] = []
