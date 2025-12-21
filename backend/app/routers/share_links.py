from typing import List, Optional
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from ..database import get_session
from ..models import ShareLinkModel


router = APIRouter(prefix="/share-links", tags=["share_links"])


class ShareLinkCreate(BaseModel):
    org_id: Optional[str] = None
    project_id: Optional[str] = None
    object_type: str
    object_id: str
    expires_at: Optional[int] = None


@router.get("/", response_model=List[ShareLinkModel])
async def list_share_links(
    object_type: Optional[str] = None,
    object_id: Optional[str] = None,
    project_id: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
):
    stmt = select(ShareLinkModel).where(ShareLinkModel.revoked_at == None)
    if object_type:
        stmt = stmt.where(ShareLinkModel.object_type == object_type)
    if object_id:
        stmt = stmt.where(ShareLinkModel.object_id == object_id)
    if project_id:
        stmt = stmt.where(ShareLinkModel.project_id == project_id)

    res = await session.execute(stmt)
    return res.scalars().all()


@router.get("/{token}", response_model=ShareLinkModel)
async def get_share_link(
    token: str,
    session: AsyncSession = Depends(get_session),
):
    stmt = select(ShareLinkModel).where(ShareLinkModel.token == token)
    res = await session.execute(stmt)
    link = res.scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=404, detail="Share link not found")
    if link.revoked_at:
        raise HTTPException(status_code=410, detail="Share link revoked")
    if link.expires_at and link.expires_at < int(time.time() * 1000):
        raise HTTPException(status_code=410, detail="Share link expired")
    return link


@router.post("/", response_model=ShareLinkModel)
async def create_share_link(
    payload: ShareLinkCreate,
    session: AsyncSession = Depends(get_session),
):
    token = uuid.uuid4().hex[:12]
    link = ShareLinkModel(
        id=f"sh_{uuid.uuid4().hex[:10]}",
        token=token,
        org_id=payload.org_id,
        project_id=payload.project_id,
        object_type=payload.object_type,
        object_id=payload.object_id,
        expires_at=payload.expires_at,
        created_at=int(time.time() * 1000),
    )
    session.add(link)
    await session.commit()
    await session.refresh(link)
    return link


@router.delete("/{token}", response_model=ShareLinkModel)
async def revoke_share_link(
    token: str,
    session: AsyncSession = Depends(get_session),
):
    stmt = select(ShareLinkModel).where(ShareLinkModel.token == token)
    res = await session.execute(stmt)
    link = res.scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=404, detail="Share link not found")

    link.revoked_at = int(time.time() * 1000)
    session.add(link)
    await session.commit()
    await session.refresh(link)
    return link

