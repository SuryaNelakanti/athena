"""Athena workflows persistence models."""

from typing import Any, Dict, List, Optional

from sqlalchemy import Column
from sqlmodel import Field, JSON, SQLModel


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
    payload: Dict = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)
    updated_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)


class AutomationRuleModel(SQLModel, table=True):
    __tablename__ = "automation_rule"

    id: str = Field(primary_key=True)
    project_id: str = Field(index=True)
    name: str = Field(index=True)
    enabled: bool = Field(default=True, index=True)
    trigger: Dict = Field(sa_column=Column(JSON), default_factory=dict)
    actions: List[Dict[str, Any]] = Field(sa_column=Column(JSON), default_factory=list)
    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)
    updated_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)


class AutomationRunModel(SQLModel, table=True):
    __tablename__ = "automation_run"

    id: str = Field(primary_key=True)
    rule_id: str = Field(foreign_key="automation_rule.id", index=True)
    project_id: str = Field(index=True)
    source_type: str = Field(index=True)
    source_id: str = Field(index=True)
    status: str = Field(default="completed", index=True)
    trigger_snapshot: Dict = Field(sa_column=Column(JSON), default_factory=dict)
    action_results: List[Dict[str, Any]] = Field(sa_column=Column(JSON), default_factory=list)
    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)
