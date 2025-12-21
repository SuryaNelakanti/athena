"""
Organizations Router - CRUD operations for Athena organizations.
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
import uuid
import time

from app.database import get_session
from app.models import OrganizationModel


router = APIRouter(prefix="/organizations", tags=["organizations"])


# --- Request/Response Schemas ---

class OrganizationCreate(BaseModel):
    name: str
    description: Optional[str] = None


class OrganizationUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class OrganizationResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    created_at: int
    updated_at: int

    class Config:
        from_attributes = True


# --- Endpoints ---

@router.get("", response_model=List[OrganizationResponse])
async def list_organizations(session: AsyncSession = Depends(get_session)):
    """List all organizations."""
    result = await session.execute(select(OrganizationModel))
    return result.scalars().all()


@router.get("/{org_id}", response_model=OrganizationResponse)
async def get_organization(org_id: str, session: AsyncSession = Depends(get_session)):
    """Get a specific organization by ID."""
    org = await session.get(OrganizationModel, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


@router.post("", response_model=OrganizationResponse, status_code=201)
async def create_organization(
    org: OrganizationCreate, 
    session: AsyncSession = Depends(get_session)
):
    """Create a new organization."""
    # Generate a unique org ID
    org_id = f"org_{uuid.uuid4().hex[:12]}"
    now = int(time.time() * 1000)
    
    db_org = OrganizationModel(
        id=org_id,
        name=org.name,
        description=org.description,
        created_at=now,
        updated_at=now
    )
    
    session.add(db_org)
    await session.commit()
    await session.refresh(db_org)
    return db_org


@router.put("/{org_id}", response_model=OrganizationResponse)
async def update_organization(
    org_id: str,
    org: OrganizationUpdate,
    session: AsyncSession = Depends(get_session)
):
    """Update an existing organization."""
    db_org = await session.get(OrganizationModel, org_id)
    if not db_org:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    if org.name is not None:
        db_org.name = org.name
    if org.description is not None:
        db_org.description = org.description
    
    db_org.updated_at = int(time.time() * 1000)
    
    session.add(db_org)
    await session.commit()
    await session.refresh(db_org)
    return db_org


@router.delete("/{org_id}")
async def delete_organization(org_id: str, session: AsyncSession = Depends(get_session)):
    """Delete an organization."""
    org = await session.get(OrganizationModel, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    await session.delete(org)
    await session.commit()
    return {"status": "success", "message": f"Organization {org_id} deleted"}
