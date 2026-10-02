"""Athena playgrounds persistence models."""

from typing import Dict, Optional

from sqlalchemy import Column
from sqlmodel import Field, JSON, SQLModel


class PlaygroundModel(SQLModel, table=True):
    __tablename__ = "playground"

    id: str = Field(primary_key=True)
    project_id: str = Field(foreign_key="project.id", index=True)
    name: str = Field(index=True)
    description: Optional[str] = None
    config: Dict = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)
    updated_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)
