"""
Guardrails Router - CRUD endpoints for managing guardrails.
"""

from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select
import uuid
import time

from ..database import get_session
from ..models import GuardrailModel


router = APIRouter(prefix="/guardrails", tags=["guardrails"])


@router.get("/", response_model=List[GuardrailModel])
async def list_guardrails(
    project_id: str,
    session: AsyncSession = Depends(get_session)
):
    """List all guardrails for a project."""
    statement = select(GuardrailModel).where(
        GuardrailModel.project_id == project_id
    ).order_by(GuardrailModel.priority.desc())
    result = await session.execute(statement)
    return result.scalars().all()


@router.post("/", response_model=GuardrailModel)
async def create_guardrail(
    guardrail: GuardrailModel,
    session: AsyncSession = Depends(get_session)
):
    """Create a new guardrail."""
    if not guardrail.id:
        guardrail.id = f"guard_{uuid.uuid4().hex[:8]}"
    if not guardrail.created_at:
        guardrail.created_at = int(time.time() * 1000)
    
    session.add(guardrail)
    await session.commit()
    await session.refresh(guardrail)
    return guardrail


@router.get("/{guardrail_id}", response_model=GuardrailModel)
async def get_guardrail(
    guardrail_id: str,
    session: AsyncSession = Depends(get_session)
):
    """Get a single guardrail by ID."""
    guardrail = await session.get(GuardrailModel, guardrail_id)
    if not guardrail:
        raise HTTPException(status_code=404, detail="Guardrail not found")
    return guardrail


@router.patch("/{guardrail_id}", response_model=GuardrailModel)
async def update_guardrail(
    guardrail_id: str,
    enabled: Optional[bool] = None,
    action: Optional[str] = None,
    name: Optional[str] = None,
    description: Optional[str] = None,
    priority: Optional[int] = None,
    session: AsyncSession = Depends(get_session)
):
    """Update a guardrail (partial update)."""
    guardrail = await session.get(GuardrailModel, guardrail_id)
    if not guardrail:
        raise HTTPException(status_code=404, detail="Guardrail not found")
    
    if enabled is not None:
        guardrail.enabled = enabled
    if action is not None:
        guardrail.action = action
    if name is not None:
        guardrail.name = name
    if description is not None:
        guardrail.description = description
    if priority is not None:
        guardrail.priority = priority
    
    await session.commit()
    await session.refresh(guardrail)
    return guardrail


@router.delete("/{guardrail_id}")
async def delete_guardrail(
    guardrail_id: str,
    session: AsyncSession = Depends(get_session)
):
    """Delete a guardrail."""
    guardrail = await session.get(GuardrailModel, guardrail_id)
    if not guardrail:
        raise HTTPException(status_code=404, detail="Guardrail not found")
    
    await session.delete(guardrail)
    await session.commit()
    return {"status": "deleted", "id": guardrail_id}


@router.post("/from-anti-pattern", response_model=GuardrailModel)
async def create_guardrail_from_anti_pattern(
    project_id: str,
    pattern_id: str,
    name: str,
    action: str = "warn",
    session: AsyncSession = Depends(get_session)
):
    """Create a guardrail from an existing anti-pattern dataset row."""
    from ..models import DatasetRowModel
    
    # Verify the pattern exists and is an anti-pattern
    pattern = await session.get(DatasetRowModel, pattern_id)
    if not pattern:
        raise HTTPException(status_code=404, detail="Anti-pattern not found")
    if pattern.example_type != "anti_pattern":
        raise HTTPException(status_code=400, detail="Dataset row is not an anti-pattern")
    
    guardrail = GuardrailModel(
        id=f"guard_{uuid.uuid4().hex[:8]}",
        project_id=project_id,
        name=name,
        description=f"Block outputs similar to anti-pattern: {pattern_id}",
        action=action,
        condition_type="anti_pattern",
        condition_config={"pattern_ids": [pattern_id]},
        enabled=True,
        created_at=int(time.time() * 1000)
    )
    
    session.add(guardrail)
    await session.commit()
    await session.refresh(guardrail)
    return guardrail
