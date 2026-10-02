"""Athena collaboration persistence models."""

from typing import Dict, Optional

from sqlalchemy import Column, UniqueConstraint
from sqlmodel import Field, JSON, SQLModel


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
    meta: Dict = Field(default_factory=dict, sa_column=Column(JSON))
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
