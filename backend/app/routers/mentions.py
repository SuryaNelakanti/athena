from typing import List, Optional
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from ..database import get_session
from ..models import MentionModel


router = APIRouter(prefix="/mentions", tags=["mentions"])


class MentionCreate(BaseModel):
    org_id: Optional[str] = None
    project_id: Optional[str] = None
    object_type: str
    object_id: str
    mentioned: str
    note: Optional[str] = None


@router.get("/", response_model=List[MentionModel])
async def list_mentions(
    object_type: Optional[str] = None,
    object_id: Optional[str] = None,
    project_id: Optional[str] = None,
    mentioned: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
):
    stmt = select(MentionModel)
    if object_type:
        stmt = stmt.where(MentionModel.object_type == object_type)
    if object_id:
        stmt = stmt.where(MentionModel.object_id == object_id)
    if project_id:
        stmt = stmt.where(MentionModel.project_id == project_id)
    if mentioned:
        stmt = stmt.where(MentionModel.mentioned == mentioned)

    res = await session.execute(stmt)
    return res.scalars().all()


@router.post("/", response_model=MentionModel)
async def create_mention(
    payload: MentionCreate,
    session: AsyncSession = Depends(get_session),
):
    mention = MentionModel(
        id=f"men_{uuid.uuid4().hex[:10]}",
        org_id=payload.org_id,
        project_id=payload.project_id,
        object_type=payload.object_type,
        object_id=payload.object_id,
        mentioned=payload.mentioned,
        note=payload.note,
        created_at=int(time.time() * 1000),
    )
    session.add(mention)
    await session.commit()
    await session.refresh(mention)
    return mention


@router.delete("/{mention_id}")
async def delete_mention(
    mention_id: str,
    session: AsyncSession = Depends(get_session),
):
    mention = await session.get(MentionModel, mention_id)
    if not mention:
        raise HTTPException(status_code=404, detail="Mention not found")
    await session.delete(mention)
    await session.commit()
    return {"status": "deleted", "id": mention_id}

