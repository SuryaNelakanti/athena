from typing import List, Optional, Any, Dict
from enum import Enum
from sqlmodel import SQLModel, Field, Relationship, JSON
from sqlalchemy import Column
from pydantic import BaseModel
from sqlalchemy import UniqueConstraint

# Enums
class SpanType(str, Enum):
    LLM = 'llm'
    TOOL = 'tool'
    CHAIN = 'chain'
    RETRIEVER = 'retriever'

# Database Models

# --- Organization Model ---
class OrganizationModel(SQLModel, table=True):
    """Organizations are the top-level container for projects and users."""
    __tablename__ = "organization"
    
    id: str = Field(primary_key=True)
    name: str
    description: Optional[str] = None
    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000))
    updated_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000))


# --- Audit Log Model ---
class AuditLogModel(SQLModel, table=True):
    """
    Audit logs record who-did-what for compliance and debugging.
    Every mutating action should create an audit log entry.
    """
    __tablename__ = "audit_log"
    
    id: str = Field(primary_key=True)
    org_id: Optional[str] = Field(default=None, index=True)
    project_id: Optional[str] = Field(default=None, index=True)
    actor_id: Optional[str] = Field(default=None, index=True)  # user or service account ID
    action: str = Field(index=True)  # CREATE, UPDATE, DELETE, RUN, etc.
    entity_type: str = Field(index=True)  # project, dataset, experiment, trace, function, etc.
    entity_id: str = Field(index=True)
    changes: Dict = Field(sa_column=Column(JSON), default={})  # {field: {old, new}}
    audit_metadata: Dict = Field(sa_column=Column(JSON), default={})  # Additional context
    timestamp: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)


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
    entity_type: str = Field(default="traces", index=True)  # traces, logs, datasets
    config: Dict = Field(sa_column=Column(JSON), default={})
    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000))

# --- Log Models (first-class, separate from traces) ---

class LogLevel(str, Enum):
    DEBUG = 'DEBUG'
    INFO = 'INFO'
    WARN = 'WARN'
    ERROR = 'ERROR'

class LogModel(SQLModel, table=True):
    __tablename__ = "log"
    
    id: str = Field(primary_key=True)
    project_id: str = Field(foreign_key="project.id", index=True)
    trace_id: Optional[str] = Field(default=None, index=True)  # Optional link to trace
    span_id: Optional[str] = Field(default=None, index=True)   # Optional link to span
    
    level: str = Field(default="INFO", index=True)  # DEBUG, INFO, WARN, ERROR
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
    attributes: Dict = Field(sa_column=Column(JSON), default={})
    log_metadata: Dict = Field(sa_column=Column(JSON), default={})
    
    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000))


# --- Review Queue Models ---

class ReviewItemModel(SQLModel, table=True):
    __tablename__ = "review_item"

    id: str = Field(primary_key=True)
    org_id: Optional[str] = Field(default=None, index=True)
    project_id: str = Field(index=True)
    source_type: str = Field(index=True)  # trace | log | experiment_result | dataset_row
    source_id: str = Field(index=True)
    status: str = Field(default="open", index=True)  # open | in_review | resolved | dismissed
    priority: int = Field(default=0, index=True)
    labels: List[str] = Field(sa_column=Column(JSON), default=[])
    score: Optional[float] = Field(default=None)
    notes: Optional[str] = Field(default=None)
    dataset_id: Optional[str] = Field(default=None, index=True)
    dataset_row_id: Optional[str] = Field(default=None, index=True)
    meta: Dict = Field(sa_column=Column(JSON), default={})
    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)
    updated_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)
    resolved_at: Optional[int] = Field(default=None, index=True)



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
    dataset_id: str = Field(foreign_key="dataset.id", index=True)
    
    # Append-only versioning fields
    logical_id: str = Field(index=True)  # Groups revisions of the same logical row
    version: int = Field(default=1)  # Revision number for this logical row
    dataset_version: int = Field(default=1, index=True)  # Dataset version when this revision was added
    is_deleted: bool = Field(default=False)  # Tombstone marker for soft deletes
    
    # Content fields
    input: Dict = Field(sa_column=Column(JSON), default={})
    expected: Optional[Dict] = Field(sa_column=Column(JSON), default={})
    meta: Dict = Field(sa_column=Column(JSON), default={})
    example_type: str = Field(default="gold")  # "gold" (positive example) or "anti_pattern" (negative example)
    source_trace_id: Optional[str] = Field(default=None)  # If promoted from a trace
    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000))


class DatasetVersionModel(SQLModel, table=True):
    __tablename__ = "dataset_version"
    __table_args__ = (UniqueConstraint("dataset_id", "version", name="uq_dataset_version"),)

    id: str = Field(primary_key=True)
    dataset_id: str = Field(foreign_key="dataset.id", index=True)
    version: int = Field(index=True)
    action: str = Field(index=True)  # insert, update, delete, flush
    logical_id: Optional[str] = Field(default=None, index=True)
    row_id: Optional[str] = Field(default=None, index=True)
    meta: Dict = Field(sa_column=Column(JSON), default={})
    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)


# --- Collaboration Primitives ---

class AttachmentModel(SQLModel, table=True):
    __tablename__ = "attachment"

    id: str = Field(primary_key=True)
    org_id: Optional[str] = Field(default=None, index=True)
    project_id: Optional[str] = Field(default=None, index=True)
    object_type: str = Field(index=True)
    object_id: str = Field(index=True)
    kind: str = Field(default="external", index=True)  # external | internal
    url: str
    content_type: Optional[str] = Field(default=None)
    size_bytes: Optional[int] = Field(default=None)
    label: Optional[str] = Field(default=None)
    meta: Dict = Field(sa_column=Column(JSON), default={})
    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)


class AssignmentModel(SQLModel, table=True):
    __tablename__ = "assignment"

    id: str = Field(primary_key=True)
    org_id: Optional[str] = Field(default=None, index=True)
    project_id: Optional[str] = Field(default=None, index=True)
    object_type: str = Field(index=True)
    object_id: str = Field(index=True)
    assignee: str = Field(index=True)  # email or user id
    status: str = Field(default="open", index=True)  # open | resolved
    note: Optional[str] = Field(default=None)
    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)
    updated_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)


class MentionModel(SQLModel, table=True):
    __tablename__ = "mention"

    id: str = Field(primary_key=True)
    org_id: Optional[str] = Field(default=None, index=True)
    project_id: Optional[str] = Field(default=None, index=True)
    object_type: str = Field(index=True)
    object_id: str = Field(index=True)
    mentioned: str = Field(index=True)  # email or user id
    note: Optional[str] = Field(default=None)
    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)


class ShareLinkModel(SQLModel, table=True):
    __tablename__ = "share_link"
    __table_args__ = (UniqueConstraint("token", name="uq_share_link_token"),)

    id: str = Field(primary_key=True)
    token: str = Field(index=True)
    org_id: Optional[str] = Field(default=None, index=True)
    project_id: Optional[str] = Field(default=None, index=True)
    object_type: str = Field(index=True)
    object_id: str = Field(index=True)
    expires_at: Optional[int] = Field(default=None, index=True)
    revoked_at: Optional[int] = Field(default=None, index=True)
    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)


# --- Job Model ---

class JobModel(SQLModel, table=True):
    __tablename__ = "job"

    id: str = Field(primary_key=True)
    kind: str = Field(index=True)  # e.g. experiment_run
    ref_id: str = Field(index=True)
    status: str = Field(default="queued", index=True)  # queued | running | completed | error
    attempts: int = Field(default=0)
    max_attempts: int = Field(default=3)
    locked_at: Optional[int] = Field(default=None, index=True)
    started_at: Optional[int] = Field(default=None, index=True)
    completed_at: Optional[int] = Field(default=None, index=True)
    last_error: Optional[str] = Field(default=None)
    payload: Dict = Field(sa_column=Column(JSON), default={})
    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)
    updated_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)



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

# --- Experiment Versioning + Runs (vNext) ---

class ExperimentVersionModel(SQLModel, table=True):
    __tablename__ = "experiment_version"

    id: str = Field(primary_key=True)
    experiment_id: str = Field(foreign_key="experiment.id", index=True)
    version_number: int = Field(index=True)
    parent_version_id: Optional[str] = Field(default=None, index=True)
    dataset_version_pinned: int = 1
    config: Dict = Field(sa_column=Column(JSON), default={})
    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)


class ExperimentRunModel(SQLModel, table=True):
    __tablename__ = "experiment_run"

    id: str = Field(primary_key=True)
    experiment_version_id: str = Field(foreign_key="experiment_version.id", index=True)
    status: str = Field(default="queued", index=True)  # queued, running, completed, error, canceled
    summary: Dict = Field(sa_column=Column(JSON), default={})

    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)
    started_at: Optional[int] = None
    completed_at: Optional[int] = None
    cancel_requested_at: Optional[int] = None


class ExperimentRunResultModel(SQLModel, table=True):
    __tablename__ = "experiment_run_result"

    id: str = Field(primary_key=True)
    run_id: str = Field(foreign_key="experiment_run.id", index=True)
    dataset_row_id: str = Field(foreign_key="dataset_row.id", index=True)
    output: Dict = Field(sa_column=Column(JSON), default={})
    scores: Dict = Field(sa_column=Column(JSON), default={})
    latency_ms: float = 0.0
    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)

# --- Model registry (curated list used by UI) ---

class ModelRegistryModel(SQLModel, table=True):
    __tablename__ = "model_registry"
    __table_args__ = (UniqueConstraint("provider", "model_id", name="uq_model_registry_provider_model_id"),)

    id: str = Field(primary_key=True)
    provider: str = Field(index=True)
    model_id: str = Field(index=True)
    display_name: Optional[str] = None
    enabled: bool = Field(default=True, index=True)
    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)


# --- Function/Scorer Registry ---

class FunctionType(str, Enum):
    SCORER = 'scorer'
    TOOL = 'tool'

class FunctionRuntime(str, Enum):
    BUILTIN = 'builtin'
    PYTHON = 'python'
    LLM_JUDGE = 'llm_judge'

class FunctionModel(SQLModel, table=True):
    __tablename__ = "function"
    __table_args__ = (UniqueConstraint("project_id", "name", name="uq_function_project_name"),)

    id: str = Field(primary_key=True)
    project_id: Optional[str] = Field(default=None, foreign_key="project.id", index=True)  # None = global/builtin
    name: str = Field(index=True)  # e.g., "exact_match", "contains", "llm_judge"
    display_name: Optional[str] = None
    description: Optional[str] = None
    type: str = Field(default="scorer", index=True)  # scorer | tool
    runtime: str = Field(default="builtin", index=True)  # builtin | python | llm_judge
    config: Dict = Field(sa_column=Column(JSON), default={})  # scorer-specific configuration
    code: Optional[str] = None  # For custom Python scorers (future)
    enabled: bool = Field(default=True, index=True)
    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)


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


# --- Guardrail Model ---

class GuardrailModel(SQLModel, table=True):
    """
    Guardrails are runtime protection rules that check outputs before returning to users.
    They can block, warn, or flag responses based on anti-patterns or other conditions.
    """
    __tablename__ = "guardrail"
    id: str = Field(primary_key=True)
    project_id: str = Field(foreign_key="project.id")
    name: str
    description: Optional[str] = None
    action: str = Field(default="warn")  # "block", "warn", "flag_for_review"
    condition_type: str = Field(default="anti_pattern")  # "anti_pattern", "regex", "keyword"
    condition_config: Dict = Field(sa_column=Column(JSON), default={})  # e.g. {"pattern_ids": [...], "keywords": [...]}
    enabled: bool = Field(default=True)
    priority: int = Field(default=0)  # Higher priority runs first
    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000))

