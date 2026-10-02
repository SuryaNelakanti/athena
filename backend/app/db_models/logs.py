"""Athena logs persistence models."""

from typing import Dict, List, Optional

from sqlalchemy import Column
from sqlmodel import Field, JSON, SQLModel


class ViewModel(SQLModel, table=True):
    __tablename__ = "view"

    id: str = Field(primary_key=True)
    project_id: str = Field(index=True)
    name: str
    entity_type: str = Field(default="traces", index=True)  # traces, logs, datasets
    config: Dict = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000))


class LogModel(SQLModel, table=True):
    __tablename__ = "log"

    id: str = Field(primary_key=True)
    project_id: str = Field(foreign_key="project.id", index=True)
    trace_id: Optional[str] = Field(default=None, index=True)  # Optional link to trace
    span_id: Optional[str] = Field(default=None, index=True)   # Optional link to span

    # Deprecated: level is kept for backward compatibility (INFO/ERROR).
    level: str = Field(default="INFO", index=True)
    # Event semantics
    event_type: str = Field(default="custom", index=True)  # llm_call, llm_stream, guardrail, audit, etc.
    status: str = Field(default="success", index=True)  # success | error
    message: str
    timestamp: int = Field(index=True)

    # Proxy call metrics (nullable for non-proxy logs)
    latency_ms: Optional[float] = Field(default=None)
    prompt_tokens: Optional[int] = Field(default=None)
    completion_tokens: Optional[int] = Field(default=None)
    total_tokens: Optional[int] = Field(default=None)
    cost: Optional[float] = Field(default=None)
    model: Optional[str] = Field(default=None, index=True)
    provider: Optional[str] = Field(default=None, index=True)

    # Structured data
    attributes: Dict = Field(default_factory=dict, sa_column=Column(JSON))
    log_metadata: Dict = Field(default_factory=dict, sa_column=Column(JSON))

    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000))


class MonitorChartModel(SQLModel, table=True):
    __tablename__ = "monitor_chart"

    id: str = Field(primary_key=True)
    project_id: str = Field(index=True)
    name: str
    query: str
    chart_type: str = Field(default="line", index=True)  # line | area | bar
    x_field: str
    y_field: str
    series_field: Optional[str] = None
    config: Dict = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000))
    updated_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000))


class ReviewItemModel(SQLModel, table=True):
    __tablename__ = "review_item"

    id: str = Field(primary_key=True)
    org_id: Optional[str] = Field(default=None, index=True)
    project_id: str = Field(index=True)
    source_type: str = Field(index=True)  # trace | log | experiment_result | dataset_row
    source_id: str = Field(index=True)
    status: str = Field(default="open", index=True)  # open | in_review | resolved | dismissed
    priority: int = Field(default=0, index=True)
    labels: List[str] = Field(default_factory=list, sa_column=Column(JSON))
    score: Optional[float] = Field(default=None)
    notes: Optional[str] = Field(default=None)
    dataset_id: Optional[str] = Field(default=None, index=True)
    dataset_row_id: Optional[str] = Field(default=None, index=True)
    meta: Dict = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)
    updated_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)
    resolved_at: Optional[int] = Field(default=None, index=True)
