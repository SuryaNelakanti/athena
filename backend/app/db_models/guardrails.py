"""Athena guardrails persistence models."""

from typing import Dict, Optional

from sqlalchemy import Column
from sqlmodel import Field, JSON, SQLModel


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
    condition_config: Dict = Field(default_factory=dict, sa_column=Column(JSON))  # e.g. {"pattern_ids": [...], "keywords": [...]}
    enabled: bool = Field(default=True)
    priority: int = Field(default=0)  # Higher priority runs first
    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000))
