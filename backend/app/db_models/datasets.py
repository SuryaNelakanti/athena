"""Athena datasets persistence models."""

from typing import Dict, Optional

from sqlalchemy import Column, UniqueConstraint
from sqlmodel import Field, JSON, SQLModel


class DatasetModel(SQLModel, table=True):
    __tablename__ = "dataset"
    id: str = Field(primary_key=True)
    project_id: str = Field(foreign_key="project.id")
    name: str
    description: Optional[str] = None
    version: int = Field(default=1)
    kind: str = Field(default="eval", index=True)
    schema: Dict = Field(default_factory=dict, sa_column=Column(JSON))
    schema_version: int = Field(default=1)
    review_policy: Dict = Field(default_factory=dict, sa_column=Column(JSON))
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
    row_kind: str = Field(default="eval", index=True)  # eval | resource
    eval_label: Optional[str] = Field(default=None, index=True)  # gold | anti_pattern
    input: Dict = Field(default_factory=dict, sa_column=Column(JSON))
    expected: Optional[Dict] = Field(default_factory=dict, sa_column=Column(JSON))
    meta: Dict = Field(default_factory=dict, sa_column=Column(JSON))
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
    meta: Dict = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)
