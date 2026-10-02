"""Athena providers persistence models."""

from typing import Optional

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, SQLModel


class ProviderKeyModel(SQLModel, table=True):
    __tablename__ = "provider_key"
    __table_args__ = (UniqueConstraint("org_id", "project_id", "provider", name="uq_provider_key_scope"),)

    id: str = Field(primary_key=True)
    org_id: Optional[str] = Field(default=None, index=True)
    project_id: Optional[str] = Field(default=None, index=True)
    provider: str = Field(index=True)
    encrypted_api_key: str
    api_key_last4: Optional[str] = None
    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)
    updated_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)
    revoked_at: Optional[int] = Field(default=None, index=True)
