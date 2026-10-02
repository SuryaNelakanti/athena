"""Athena identity persistence models."""

from typing import Dict, Optional

from sqlalchemy import Column, UniqueConstraint
from sqlmodel import Field, JSON, SQLModel


class OrganizationModel(SQLModel, table=True):
    """Organizations are the top-level container for projects and users."""
    __tablename__ = "organization"

    id: str = Field(primary_key=True)
    name: str
    description: Optional[str] = None
    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000))
    updated_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000))


class UserModel(SQLModel, table=True):
    __tablename__ = "user"
    __table_args__ = (UniqueConstraint("org_id", "email", name="uq_user_org_email"),)

    id: str = Field(primary_key=True)
    org_id: Optional[str] = Field(default=None, index=True)
    email: str = Field(index=True)
    name: Optional[str] = None
    role: Optional[str] = Field(default="member", index=True)
    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)
    updated_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)


class SessionModel(SQLModel, table=True):
    __tablename__ = "session"
    __table_args__ = (UniqueConstraint("token_hash", name="uq_session_token_hash"),)

    id: str = Field(primary_key=True)
    user_id: str = Field(foreign_key="user.id", index=True)
    token_hash: str = Field(index=True)
    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)
    expires_at: Optional[int] = Field(default=None, index=True)
    revoked_at: Optional[int] = Field(default=None, index=True)
    last_used_at: Optional[int] = Field(default=None)


class ServiceAccountModel(SQLModel, table=True):
    __tablename__ = "service_account"

    id: str = Field(primary_key=True)
    org_id: str = Field(index=True)
    name: str
    description: Optional[str] = None
    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)
    updated_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)
    revoked_at: Optional[int] = Field(default=None, index=True)


class ServiceTokenModel(SQLModel, table=True):
    __tablename__ = "service_token"
    __table_args__ = (UniqueConstraint("token_hash", name="uq_service_token_hash"),)

    id: str = Field(primary_key=True)
    service_account_id: str = Field(foreign_key="service_account.id", index=True)
    name: Optional[str] = None
    token_hash: str = Field(index=True)
    token_last4: Optional[str] = None
    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)
    last_used_at: Optional[int] = Field(default=None)
    revoked_at: Optional[int] = Field(default=None, index=True)


class McpAuthCodeModel(SQLModel, table=True):
    __tablename__ = "mcp_auth_code"
    __table_args__ = (UniqueConstraint("code_hash", name="uq_mcp_auth_code_hash"),)

    id: str = Field(primary_key=True)
    client_id: str = Field(index=True)
    redirect_uri: str
    code_hash: str = Field(index=True)
    code_challenge: str
    code_challenge_method: str = Field(default="S256")
    org_id: Optional[str] = Field(default=None, index=True)
    project_id: Optional[str] = Field(default=None, index=True)
    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)
    expires_at: int = Field(index=True)
    consumed_at: Optional[int] = Field(default=None, index=True)


class McpTokenModel(SQLModel, table=True):
    __tablename__ = "mcp_token"
    __table_args__ = (UniqueConstraint("token_hash", name="uq_mcp_token_hash"),)

    id: str = Field(primary_key=True)
    client_id: str = Field(index=True)
    token_hash: str = Field(index=True)
    token_last4: Optional[str] = None
    org_id: Optional[str] = Field(default=None, index=True)
    project_id: Optional[str] = Field(default=None, index=True)
    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)
    last_used_at: Optional[int] = Field(default=None)
    expires_at: Optional[int] = Field(default=None, index=True)
    revoked_at: Optional[int] = Field(default=None, index=True)


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
    changes: Dict = Field(default_factory=dict, sa_column=Column(JSON))  # {field: {old, new}}
    audit_metadata: Dict = Field(default_factory=dict, sa_column=Column(JSON))  # Additional context
    timestamp: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)
