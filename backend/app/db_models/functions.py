"""Athena functions persistence models."""

from enum import Enum
from typing import Dict, Optional

from sqlalchemy import Column, UniqueConstraint
from sqlmodel import Field, JSON, SQLModel


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
    config: Dict = Field(default_factory=dict, sa_column=Column(JSON))  # scorer-specific configuration
    code: Optional[str] = None  # For custom Python scorers (future)
    enabled: bool = Field(default=True, index=True)
    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)


class FunctionVersionModel(SQLModel, table=True):
    __tablename__ = "function_version"
    __table_args__ = (UniqueConstraint("function_id", "version", name="uq_function_version"),)

    id: str = Field(primary_key=True)
    function_id: str = Field(foreign_key="function.id", index=True)
    version: int = Field(index=True)
    runtime: str = Field(default="builtin", index=True)
    config: Dict = Field(sa_column=Column(JSON), default_factory=dict)
    code: Optional[str] = None
    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)


class RemoteEvalModel(SQLModel, table=True):
    __tablename__ = "remote_eval"

    id: str = Field(primary_key=True)
    project_id: str = Field(foreign_key="project.id", index=True)
    name: str = Field(index=True)
    endpoint_url: str
    auth: Dict = Field(sa_column=Column(JSON), default_factory=dict)
    config: Dict = Field(sa_column=Column(JSON), default_factory=dict)
    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)
    updated_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)
