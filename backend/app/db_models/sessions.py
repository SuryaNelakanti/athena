"""Athena sessions persistence models."""

from typing import Any, Dict, List, Optional

from sqlalchemy import Column
from sqlmodel import Field, JSON, SQLModel


class AgentSessionModel(SQLModel, table=True):
    __tablename__ = "agent_session"

    id: str = Field(primary_key=True)
    project_id: str = Field(foreign_key="project.id", index=True)
    agent_name: Optional[str] = Field(default=None, index=True)
    env: Optional[str] = Field(default=None, index=True)
    status: str = Field(default="active", index=True)
    tags: List[str] = Field(default_factory=list, sa_column=Column(JSON))
    metadata_: Dict = Field(sa_column=Column("metadata", JSON), default_factory=dict)
    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)
    updated_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)
    last_run_at: Optional[int] = Field(default=None, index=True)


class AgentRunModel(SQLModel, table=True):
    __tablename__ = "agent_run"

    id: str = Field(primary_key=True)
    session_id: str = Field(foreign_key="agent_session.id", index=True)
    project_id: str = Field(index=True)
    trace_id: Optional[str] = Field(default=None, index=True)
    status: str = Field(default="completed", index=True)
    started_at: int = Field(index=True)
    ended_at: Optional[int] = Field(default=None, index=True)
    total_tokens: Optional[int] = Field(default=None)
    total_cost: Optional[float] = Field(default=None)
    total_latency: Optional[float] = Field(default=None)
    tags: List[str] = Field(default_factory=list, sa_column=Column(JSON))
    metadata_: Dict = Field(sa_column=Column("metadata", JSON), default_factory=dict)
    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)


class AgentSessionEventModel(SQLModel, table=True):
    __tablename__ = "agent_session_event"

    id: str = Field(primary_key=True)
    session_id: str = Field(foreign_key="agent_session.id", index=True)
    run_id: Optional[str] = Field(default=None, foreign_key="agent_run.id", index=True)
    sequence: int = Field(index=True)
    event_type: str = Field(index=True)
    timestamp: int = Field(index=True)
    payload: Dict = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)


class AgentSessionAnnotationModel(SQLModel, table=True):
    __tablename__ = "agent_session_annotation"

    id: str = Field(primary_key=True)
    session_id: str = Field(foreign_key="agent_session.id", index=True)
    project_id: str = Field(index=True)
    labels: List[str] = Field(default_factory=list, sa_column=Column(JSON))
    severity: Optional[str] = Field(default=None, index=True)
    owner: Optional[str] = Field(default=None, index=True)
    status: str = Field(default="open", index=True)
    note: Optional[str] = Field(default=None)
    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)
    updated_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)


class AgentSessionIngestModel(SQLModel, table=True):
    __tablename__ = "agent_session_ingest"

    id: str = Field(primary_key=True)
    project_id: str = Field(index=True)
    session_id: str = Field(index=True)
    schema_version: str = Field(index=True)
    payload: Dict = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)


class AgentSessionEvalModel(SQLModel, table=True):
    __tablename__ = "agent_session_eval"

    id: str = Field(primary_key=True)
    session_id: str = Field(foreign_key="agent_session.id", index=True)
    project_id: str = Field(index=True)
    run_id: Optional[str] = Field(default=None, index=True)
    version: int = Field(default=1, index=True)
    rubric: Dict = Field(sa_column=Column(JSON), default_factory=dict)
    scorers: List[Dict[str, Any]] = Field(sa_column=Column(JSON), default_factory=list)
    scores: Dict = Field(sa_column=Column(JSON), default_factory=dict)
    summary: Dict = Field(sa_column=Column(JSON), default_factory=dict)
    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)


class RunReplayModel(SQLModel, table=True):
    __tablename__ = "run_replay"

    id: str = Field(primary_key=True)
    project_id: str = Field(index=True)
    source_run_id: str = Field(foreign_key="agent_run.id", index=True)
    replay_run_id: str = Field(foreign_key="agent_run.id", index=True)
    mode: str = Field(default="frozen_tools", index=True)
    status: str = Field(default="created", index=True)
    summary: Dict = Field(sa_column=Column(JSON), default_factory=dict)
    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)
