"""
Audit Service - Records who-did-what for compliance and debugging.

Every mutating action should create an audit log entry via this service.
"""
from typing import Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
import uuid
import time

from app.models import AuditLogModel


async def log_action(
    session: AsyncSession,
    action: str,           # CREATE, UPDATE, DELETE, RUN, CANCEL, etc.
    entity_type: str,      # project, dataset, experiment, trace, function, organization, etc.
    entity_id: str,
    changes: Dict[str, Any] = None,
    org_id: Optional[str] = None,
    project_id: Optional[str] = None,
    actor_id: Optional[str] = None,  # user or service account ID
    metadata: Dict[str, Any] = None
) -> AuditLogModel:
    """
    Create an audit log entry.
    
    Args:
        session: Database session
        action: The action performed (CREATE, UPDATE, DELETE, RUN, etc.)
        entity_type: Type of entity affected (project, dataset, experiment, etc.)
        entity_id: ID of the affected entity
        changes: Dictionary of field changes {field: {old: value, new: value}}
        org_id: Organization ID (optional)
        project_id: Project ID (optional)
        actor_id: ID of the user or service account performing the action
        metadata: Additional context about the action
    
    Returns:
        The created AuditLogModel entry
    """
    audit_log = AuditLogModel(
        id=f"audit_{uuid.uuid4().hex[:16]}",
        org_id=org_id,
        project_id=project_id,
        actor_id=actor_id,
        action=action.upper(),
        entity_type=entity_type.lower(),
        entity_id=entity_id,
        changes=changes or {},
        audit_metadata=metadata or {},
        timestamp=int(time.time() * 1000)
    )
    
    session.add(audit_log)
    # Note: We don't commit here - let the caller manage the transaction
    # This allows audit logs to be part of the same transaction as the action
    
    return audit_log


async def log_create(
    session: AsyncSession,
    entity_type: str,
    entity_id: str,
    entity_data: Dict[str, Any] = None,
    **kwargs
) -> AuditLogModel:
    """Convenience method for CREATE actions."""
    return await log_action(
        session=session,
        action="CREATE",
        entity_type=entity_type,
        entity_id=entity_id,
        changes={"created": entity_data} if entity_data else {},
        **kwargs
    )


async def log_update(
    session: AsyncSession,
    entity_type: str,
    entity_id: str,
    old_values: Dict[str, Any] = None,
    new_values: Dict[str, Any] = None,
    **kwargs
) -> AuditLogModel:
    """Convenience method for UPDATE actions."""
    changes = {}
    if old_values and new_values:
        for key in set(old_values.keys()) | set(new_values.keys()):
            old_val = old_values.get(key)
            new_val = new_values.get(key)
            if old_val != new_val:
                changes[key] = {"old": old_val, "new": new_val}
    
    return await log_action(
        session=session,
        action="UPDATE",
        entity_type=entity_type,
        entity_id=entity_id,
        changes=changes,
        **kwargs
    )


async def log_delete(
    session: AsyncSession,
    entity_type: str,
    entity_id: str,
    entity_data: Dict[str, Any] = None,
    **kwargs
) -> AuditLogModel:
    """Convenience method for DELETE actions."""
    return await log_action(
        session=session,
        action="DELETE",
        entity_type=entity_type,
        entity_id=entity_id,
        changes={"deleted": entity_data} if entity_data else {},
        **kwargs
    )
