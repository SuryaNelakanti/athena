"""Athena experiments persistence models."""

from typing import Dict, Optional

from sqlalchemy import Column, UniqueConstraint
from sqlmodel import Field, JSON, SQLModel


class ExperimentModel(SQLModel, table=True):
    __tablename__ = "experiment"
    id: str = Field(primary_key=True)
    project_id: str = Field(foreign_key="project.id")
    dataset_id: str = Field(foreign_key="dataset.id")
    name: str
    status: str = "pending" # pending, running, completed, error
    summary: Dict = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000))


class ExperimentResultModel(SQLModel, table=True):
    __tablename__ = "experiment_result"
    id: str = Field(primary_key=True)
    experiment_id: str = Field(foreign_key="experiment.id")
    dataset_row_id: str = Field(foreign_key="dataset_row.id")
    output: Dict = Field(default_factory=dict, sa_column=Column(JSON))
    scores: Dict = Field(default_factory=dict, sa_column=Column(JSON))
    latency_ms: float = 0.0
    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000))


class ExperimentVersionModel(SQLModel, table=True):
    __tablename__ = "experiment_version"

    id: str = Field(primary_key=True)
    experiment_id: str = Field(foreign_key="experiment.id", index=True)
    version_number: int = Field(index=True)
    parent_version_id: Optional[str] = Field(default=None, index=True)
    dataset_version_pinned: int = 1
    config: Dict = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)


class ExperimentRunModel(SQLModel, table=True):
    __tablename__ = "experiment_run"

    id: str = Field(primary_key=True)
    experiment_version_id: str = Field(foreign_key="experiment_version.id", index=True)
    status: str = Field(default="queued", index=True)  # queued, running, completed, error, canceled
    summary: Dict = Field(default_factory=dict, sa_column=Column(JSON))

    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)
    started_at: Optional[int] = None
    completed_at: Optional[int] = None
    cancel_requested_at: Optional[int] = None


class ExperimentRunResultModel(SQLModel, table=True):
    __tablename__ = "experiment_run_result"

    id: str = Field(primary_key=True)
    run_id: str = Field(foreign_key="experiment_run.id", index=True)
    dataset_row_id: str = Field(foreign_key="dataset_row.id", index=True)
    output: Dict = Field(default_factory=dict, sa_column=Column(JSON))
    scores: Dict = Field(default_factory=dict, sa_column=Column(JSON))
    latency_ms: float = 0.0
    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)


class ModelRegistryModel(SQLModel, table=True):
    __tablename__ = "model_registry"
    __table_args__ = (UniqueConstraint("provider", "model_id", name="uq_model_registry_provider_model_id"),)

    id: str = Field(primary_key=True)
    provider: str = Field(index=True)
    model_id: str = Field(index=True)
    display_name: Optional[str] = None
    enabled: bool = Field(default=True, index=True)
    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)
