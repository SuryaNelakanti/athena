"""Athena observability persistence models."""

from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel
from sqlalchemy import Column, UniqueConstraint
from sqlmodel import Field, JSON, Relationship, SQLModel


class SpanType(str, Enum):
    LLM = 'llm'
    TOOL = 'tool'
    CHAIN = 'chain'
    RETRIEVER = 'retriever'


class Project(SQLModel, table=True):
    id: str = Field(primary_key=True)
    name: str
    org_id: str

    traces: List["TraceModel"] = Relationship(back_populates="project")


class EnvironmentModel(SQLModel, table=True):
    __tablename__ = "environment"
    __table_args__ = (UniqueConstraint("project_id", "name", name="uq_environment_project_name"),)

    id: str = Field(primary_key=True)
    project_id: str = Field(foreign_key="project.id", index=True)
    name: str
    description: Optional[str] = None
    is_default: bool = Field(default=False, index=True)
    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)
    updated_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)


class TraceModel(SQLModel, table=True):
    __tablename__ = "trace" # Rename table to avoid keyword conflicts if any, though Trace is usually safe

    id: str = Field(primary_key=True)
    project_id: str = Field(foreign_key="project.id")
    parent_trace_id: Optional[str] = Field(default=None, index=True)
    trace_group_id: Optional[str] = Field(default=None, index=True)
    input_span_id: Optional[str] = Field(default=None, index=True)
    output_span_id: Optional[str] = Field(default=None, index=True)
    timestamp: int = Field(index=True)
    total_latency: float
    total_cost: float
    total_tokens: int
    status: str
    tags: List[str] = Field(default_factory=list, sa_column=Column(JSON))

    project: Project = Relationship(back_populates="traces")
    spans: List["SpanModel"] = Relationship(back_populates="trace")


class SpanModel(SQLModel, table=True):
    __tablename__ = "span"

    id: str = Field(primary_key=True)
    trace_id: str = Field(foreign_key="trace.id")
    parent_id: Optional[str] = Field(default=None, index=True)
    name: str
    type: SpanType
    start_time: int
    end_time: int
    status: str
    input: Dict = Field(default_factory=dict, sa_column=Column(JSON))
    output: Dict = Field(default_factory=dict, sa_column=Column(JSON))
    # Flattenting metrics or keeping as JSON? JSON is easier for now.
    metrics: Dict = Field(default_factory=dict, sa_column=Column(JSON))
    attributes: Dict = Field(default_factory=dict, sa_column=Column(JSON))
    tags: List[str] = Field(default_factory=list, sa_column=Column(JSON))
    error_message: Optional[str] = None

    trace: TraceModel = Relationship(back_populates="spans")


class SpanFeedbackModel(SQLModel, table=True):
    __tablename__ = "span_feedback"

    id: str = Field(primary_key=True)
    project_id: str = Field(index=True)
    trace_id: str = Field(index=True)
    span_id: str = Field(foreign_key="span.id", index=True)
    feedback_type: str = Field(default="rating", index=True)
    value: Any = Field(sa_column=Column(JSON), default=None)
    comment: Optional[str] = None
    labels: List[str] = Field(default_factory=list, sa_column=Column(JSON))
    metadata_: Dict = Field(sa_column=Column("metadata", JSON), default_factory=dict)
    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)


class SpanScoreModel(SQLModel, table=True):
    __tablename__ = "span_score"
    __table_args__ = (UniqueConstraint("span_id", "name", name="uq_span_score_name"),)

    id: str = Field(primary_key=True)
    project_id: str = Field(index=True)
    trace_id: str = Field(index=True)
    span_id: str = Field(foreign_key="span.id", index=True)
    name: str = Field(index=True)
    score: Optional[float] = Field(default=None, index=True)
    passed: Optional[bool] = Field(default=None, index=True)
    reasoning: Optional[str] = None
    metadata_: Dict = Field(sa_column=Column("metadata", JSON), default_factory=dict)
    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)
    updated_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)


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
    start_time: int
    end_time: int
    status: str
    input: Any
    output: Any
    metrics: SpanMetrics
    attributes: SpanAttributes
    tags: List[str] = Field(default_factory=list)
    error_message: Optional[str] = None


class Trace(BaseModel):
    id: str
    root_span: Span
    spans: List[Span]
    project_id: str
    parent_trace_id: Optional[str] = None
    trace_group_id: Optional[str] = None
    input_span_id: Optional[str] = None
    output_span_id: Optional[str] = None
    timestamp: int
    total_latency: float
    total_cost: float
    total_tokens: int
    status: str
    tags: List[str] = Field(default_factory=list)
