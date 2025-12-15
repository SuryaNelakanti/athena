from fastapi import APIRouter, Depends, HTTPException
from typing import List, Dict, Any
from sqlmodel import Session, select
from pydantic import BaseModel
import uuid
import time

from app.database import get_session
from app.models import ViewModel

router = APIRouter(prefix="/views", tags=["views"])

class ViewCreate(BaseModel):
    project_id: str
    name: str
    config: Dict[str, Any]

class ViewResponse(BaseModel):
    id: str
    project_id: str
    name: str
    config: Dict[str, Any]
    created_at: int

@router.get("/{project_id}", response_model=List[ViewResponse])
async def get_views(project_id: str, session: Session = Depends(get_session)):
    statement = select(ViewModel).where(ViewModel.project_id == project_id).order_by(ViewModel.created_at.desc())
    result = await session.execute(statement)
    return result.scalars().all()

@router.post("", response_model=ViewResponse)
async def create_view(view: ViewCreate, session: Session = Depends(get_session)):
    db_view = ViewModel(
        id=str(uuid.uuid4()),
        project_id=view.project_id,
        name=view.name,
        config=view.config,
        created_at=int(time.time() * 1000)
    )
    session.add(db_view)
    await session.commit()
    await session.refresh(db_view)
    return db_view

@router.delete("/{view_id}")
async def delete_view(view_id: str, session: Session = Depends(get_session)):
    view = await session.get(ViewModel, view_id)
    if not view:
        raise HTTPException(status_code=404, detail="View not found")
    await session.delete(view)
    await session.commit()
    return {"status": "success"}
