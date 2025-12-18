from typing import List, Optional, Any, Dict
from enum import Enum
from sqlmodel import SQLModel, Field, Relationship, JSON
from sqlalchemy import Column
from pydantic import BaseModel

# Enums
class SpanType(str, Enum):
    LLM = 'llm'
    TOOL = 'tool'
    CHAIN = 'chain'
    RETRIEVER = 'retriever'

# Database Models

class Project(SQLModel, table=True):
    id: str = Field(primary_key=True)
    name: str
    org_id: str
    
    traces: List["TraceModel"] = Relationship(back_populates="project")

class TraceModel(SQLModel, table=True):
    __tablename__ = "trace" # Rename table to avoid keyword conflicts if any, though Trace is usually safe
    
    id: str = Field(primary_key=True)
    project_id: str = Field(foreign_key="project.id")
    timestamp: int = Field(index=True)
    total_latency: float
    total_cost: float
    total_tokens: int
    status: str
    tags: List[str] = Field(sa_column=Column(JSON), default=[])
    
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
    input: Dict = Field(sa_column=Column(JSON), default={})
    output: Dict = Field(sa_column=Column(JSON), default={})
    # Flattenting metrics or keeping as JSON? JSON is easier for now.
    metrics: Dict = Field(sa_column=Column(JSON), default={}) 
    attributes: Dict = Field(sa_column=Column(JSON), default={})
    tags: List[str] = Field(sa_column=Column(JSON), default=[])
    error_message: Optional[str] = None
    
    trace: TraceModel = Relationship(back_populates="spans")

class ViewModel(SQLModel, table=True):
    __tablename__ = "view"
    
    id: str = Field(primary_key=True)
    project_id: str = Field(index=True)
    name: str
    config: Dict = Field(sa_column=Column(JSON), default={})
    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000))

# --- Dataset Models ---

class DatasetModel(SQLModel, table=True):
    __tablename__ = "dataset"
    id: str = Field(primary_key=True)
    project_id: str = Field(foreign_key="project.id")
    name: str
    description: Optional[str] = None
    version: int = Field(default=1)
    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000))

class DatasetRowModel(SQLModel, table=True):
    __tablename__ = "dataset_row"
    id: str = Field(primary_key=True)
    dataset_id: str = Field(foreign_key="dataset.id")
    input: Dict = Field(sa_column=Column(JSON), default={})
    expected: Optional[Dict] = Field(sa_column=Column(JSON), default={})
    meta: Dict = Field(sa_column=Column(JSON), default={})
    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000))

# --- Experiment Models ---

class ExperimentModel(SQLModel, table=True):
    __tablename__ = "experiment"
    id: str = Field(primary_key=True)
    project_id: str = Field(foreign_key="project.id")
    dataset_id: str = Field(foreign_key="dataset.id")
    name: str
    status: str = "pending" # pending, running, completed, error
    summary: Dict = Field(sa_column=Column(JSON), default={})
    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000))

class ExperimentResultModel(SQLModel, table=True):
    __tablename__ = "experiment_result"
    id: str = Field(primary_key=True)
    experiment_id: str = Field(foreign_key="experiment.id")
    dataset_row_id: str = Field(foreign_key="dataset_row.id")
    output: Dict = Field(sa_column=Column(JSON), default={})
    scores: Dict = Field(sa_column=Column(JSON), default={})
    latency_ms: float = 0.0
    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000))

# Pydantic Schemas for API (matching the Frontend types mostly)

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
