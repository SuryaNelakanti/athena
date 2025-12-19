"""
Projects Router - CRUD operations for Athena projects.
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
import uuid
import time

from app.database import get_session
from app.models import Project


router = APIRouter(prefix="/projects", tags=["projects"])


# --- Request/Response Schemas ---

class ProjectCreate(BaseModel):
    name: str
    org_id: Optional[str] = "org_default"


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    org_id: Optional[str] = None


class ProjectResponse(BaseModel):
    id: str
    name: str
    org_id: str

    class Config:
        from_attributes = True


# --- Endpoints ---

@router.get("", response_model=List[ProjectResponse])
async def list_projects(session: AsyncSession = Depends(get_session)):
    """List all projects."""
    result = await session.execute(select(Project))
    return result.scalars().all()


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: str, session: AsyncSession = Depends(get_session)):
    """Get a specific project by ID."""
    project = await session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.post("", response_model=ProjectResponse, status_code=201)
async def create_project(
    project: ProjectCreate, 
    session: AsyncSession = Depends(get_session)
):
    """Create a new project."""
    # Generate a unique project ID
    project_id = f"proj_{uuid.uuid4().hex[:12]}"
    
    db_project = Project(
        id=project_id,
        name=project.name,
        org_id=project.org_id or "org_default"
    )
    
    session.add(db_project)
    await session.commit()
    await session.refresh(db_project)
    return db_project


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: str,
    project: ProjectUpdate,
    session: AsyncSession = Depends(get_session)
):
    """Update an existing project."""
    db_project = await session.get(Project, project_id)
    if not db_project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if project.name is not None:
        db_project.name = project.name
    if project.org_id is not None:
        db_project.org_id = project.org_id
    
    session.add(db_project)
    await session.commit()
    await session.refresh(db_project)
    return db_project


@router.delete("/{project_id}")
async def delete_project(project_id: str, session: AsyncSession = Depends(get_session)):
    """Delete a project."""
    project = await session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    await session.delete(project)
    await session.commit()
    return {"status": "success", "message": f"Project {project_id} deleted"}
