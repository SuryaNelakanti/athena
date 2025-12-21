from typing import List, Optional
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from ..database import get_session
from ..models import AttachmentModel


router = APIRouter(prefix="/attachments", tags=["attachments"])


class AttachmentCreate(BaseModel):
    org_id: Optional[str] = None
    project_id: Optional[str] = None
    object_type: str
    object_id: str
    kind: Optional[str] = "external"
    url: str
    content_type: Optional[str] = None
    size_bytes: Optional[int] = None
    label: Optional[str] = None
    meta: Optional[dict] = None


@router.get("/", response_model=List[AttachmentModel])
async def list_attachments(
    object_type: Optional[str] = None,
    object_id: Optional[str] = None,
    project_id: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
):
    if not object_type and not object_id and not project_id:
        raise HTTPException(status_code=400, detail="Provide at least one filter")

    stmt = select(AttachmentModel)
    if object_type:
        stmt = stmt.where(AttachmentModel.object_type == object_type)
    if object_id:
        stmt = stmt.where(AttachmentModel.object_id == object_id)
    if project_id:
        stmt = stmt.where(AttachmentModel.project_id == project_id)

    res = await session.execute(stmt)
    return res.scalars().all()


@router.get("/{attachment_id}", response_model=AttachmentModel)
async def get_attachment(
    attachment_id: str,
    session: AsyncSession = Depends(get_session),
):
    attachment = await session.get(AttachmentModel, attachment_id)
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    return attachment


@router.post("/", response_model=AttachmentModel)
async def create_attachment(
    payload: AttachmentCreate,
    session: AsyncSession = Depends(get_session),
):
    attachment = AttachmentModel(
        id=f"att_{uuid.uuid4().hex[:10]}",
        org_id=payload.org_id,
        project_id=payload.project_id,
        object_type=payload.object_type,
        object_id=payload.object_id,
        kind=payload.kind or "external",
        url=payload.url,
        content_type=payload.content_type,
        size_bytes=payload.size_bytes,
        label=payload.label,
        meta=payload.meta or {},
        created_at=int(time.time() * 1000),
    )

    session.add(attachment)
    await session.commit()
    await session.refresh(attachment)
    return attachment


@router.delete("/{attachment_id}")
async def delete_attachment(
    attachment_id: str,
    session: AsyncSession = Depends(get_session),
):
    attachment = await session.get(AttachmentModel, attachment_id)
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    await session.delete(attachment)
    await session.commit()
    return {"status": "deleted", "id": attachment_id}

