from typing import List, Optional
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from ..database import get_session
from ..models import AssignmentModel


router = APIRouter(prefix="/assignments", tags=["assignments"])


class AssignmentCreate(BaseModel):
    org_id: Optional[str] = None
    project_id: Optional[str] = None
    object_type: str
    object_id: str
    assignee: str
    status: Optional[str] = "open"
    note: Optional[str] = None


class AssignmentUpdate(BaseModel):
    assignee: Optional[str] = None
    status: Optional[str] = None
    note: Optional[str] = None


@router.get("/", response_model=List[AssignmentModel])
async def list_assignments(
    object_type: Optional[str] = None,
    object_id: Optional[str] = None,
    project_id: Optional[str] = None,
    assignee: Optional[str] = None,
    status: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
):
    stmt = select(AssignmentModel)
    if object_type:
        stmt = stmt.where(AssignmentModel.object_type == object_type)
    if object_id:
        stmt = stmt.where(AssignmentModel.object_id == object_id)
    if project_id:
        stmt = stmt.where(AssignmentModel.project_id == project_id)
    if assignee:
        stmt = stmt.where(AssignmentModel.assignee == assignee)
    if status:
        stmt = stmt.where(AssignmentModel.status == status)

    res = await session.execute(stmt)
    return res.scalars().all()


@router.get("/{assignment_id}", response_model=AssignmentModel)
async def get_assignment(
    assignment_id: str,
    session: AsyncSession = Depends(get_session),
):
    assignment = await session.get(AssignmentModel, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return assignment


@router.post("/", response_model=AssignmentModel)
async def create_assignment(
    payload: AssignmentCreate,
    session: AsyncSession = Depends(get_session),
):
    assignment = AssignmentModel(
        id=f"asg_{uuid.uuid4().hex[:10]}",
        org_id=payload.org_id,
        project_id=payload.project_id,
        object_type=payload.object_type,
        object_id=payload.object_id,
        assignee=payload.assignee,
        status=payload.status or "open",
        note=payload.note,
        created_at=int(time.time() * 1000),
        updated_at=int(time.time() * 1000),
    )
    session.add(assignment)
    await session.commit()
    await session.refresh(assignment)
    return assignment


@router.patch("/{assignment_id}", response_model=AssignmentModel)
async def update_assignment(
    assignment_id: str,
    payload: AssignmentUpdate,
    session: AsyncSession = Depends(get_session),
):
    assignment = await session.get(AssignmentModel, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    if payload.assignee is not None:
        assignment.assignee = payload.assignee
    if payload.status is not None:
        assignment.status = payload.status
    if payload.note is not None:
        assignment.note = payload.note
    assignment.updated_at = int(time.time() * 1000)

    session.add(assignment)
    await session.commit()
    await session.refresh(assignment)
    return assignment


@router.delete("/{assignment_id}")
async def delete_assignment(
    assignment_id: str,
    session: AsyncSession = Depends(get_session),
):
    assignment = await session.get(AssignmentModel, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    await session.delete(assignment)
    await session.commit()
    return {"status": "deleted", "id": assignment_id}

