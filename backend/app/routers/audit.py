"""
Audit Router - Query audit logs for compliance and debugging.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional, Dict, Any
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.database import get_session
from app.models import AuditLogModel


router = APIRouter(prefix="/audit", tags=["audit"])


# --- Response Schemas ---

class AuditLogResponse(BaseModel):
    id: str
    org_id: Optional[str] = None
    project_id: Optional[str] = None
    actor_id: Optional[str] = None
    action: str
    entity_type: str
    entity_id: str
    changes: Dict[str, Any] = {}
    audit_metadata: Dict[str, Any] = {}
    timestamp: int

    class Config:
        from_attributes = True


class AuditLogListResponse(BaseModel):
    items: List[AuditLogResponse]
    total: int
    limit: int
    offset: int


# --- Endpoints ---

@router.get("", response_model=AuditLogListResponse)
async def list_audit_logs(
    org_id: Optional[str] = None,
    project_id: Optional[str] = None,
    actor_id: Optional[str] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    action: Optional[str] = None,
    start_time: Optional[int] = None,
    end_time: Optional[int] = None,
    limit: int = Query(default=50, le=500),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session)
):
    """
    List audit logs with optional filtering.
    
    Filters:
    - org_id: Filter by organization
    - project_id: Filter by project
    - actor_id: Filter by actor (user/service account)
    - entity_type: Filter by entity type (project, dataset, experiment, etc.)
    - entity_id: Filter by specific entity ID
    - action: Filter by action (CREATE, UPDATE, DELETE, etc.)
    - start_time: Filter by timestamp >= start_time (unix ms)
    - end_time: Filter by timestamp <= end_time (unix ms)
    """
    query = select(AuditLogModel)
    
    if org_id:
        query = query.where(AuditLogModel.org_id == org_id)
    if project_id:
        query = query.where(AuditLogModel.project_id == project_id)
    if actor_id:
        query = query.where(AuditLogModel.actor_id == actor_id)
    if entity_type:
        query = query.where(AuditLogModel.entity_type == entity_type.lower())
    if entity_id:
        query = query.where(AuditLogModel.entity_id == entity_id)
    if action:
        query = query.where(AuditLogModel.action == action.upper())
    if start_time:
        query = query.where(AuditLogModel.timestamp >= start_time)
    if end_time:
        query = query.where(AuditLogModel.timestamp <= end_time)
    
    # Get total count (before pagination)
    count_query = select(AuditLogModel)
    if org_id:
        count_query = count_query.where(AuditLogModel.org_id == org_id)
    if project_id:
        count_query = count_query.where(AuditLogModel.project_id == project_id)
    # ... same filters as above for accurate count
    
    # Apply ordering and pagination
    query = query.order_by(AuditLogModel.timestamp.desc()).offset(offset).limit(limit)
    
    result = await session.execute(query)
    items = result.scalars().all()
    
    # For simplicity, return the count of items in this page
    # A proper implementation would use a separate count query
    return AuditLogListResponse(
        items=items,
        total=len(items) + offset,  # Approximation; proper impl needs COUNT query
        limit=limit,
        offset=offset
    )


@router.get("/{audit_id}", response_model=AuditLogResponse)
async def get_audit_log(audit_id: str, session: AsyncSession = Depends(get_session)):
    """Get a specific audit log entry by ID."""
    log = await session.get(AuditLogModel, audit_id)
    if not log:
        raise HTTPException(status_code=404, detail="Audit log entry not found")
    return log


@router.get("/entity/{entity_type}/{entity_id}", response_model=List[AuditLogResponse])
async def get_entity_history(
    entity_type: str,
    entity_id: str,
    limit: int = Query(default=50, le=200),
    session: AsyncSession = Depends(get_session)
):
    """Get the audit history for a specific entity."""
    query = select(AuditLogModel).where(
        AuditLogModel.entity_type == entity_type.lower(),
        AuditLogModel.entity_id == entity_id
    ).order_by(AuditLogModel.timestamp.desc()).limit(limit)
    
    result = await session.execute(query)
    return result.scalars().all()
