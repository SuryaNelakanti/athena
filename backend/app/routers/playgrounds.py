from typing import List, Optional, Any
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from ..database import get_session
from ..models import PlaygroundModel

router = APIRouter(prefix="/playgrounds", tags=["playgrounds"])


class PlaygroundCreate(BaseModel):
    id: Optional[str] = None
    project_id: str
    name: str
    description: Optional[str] = None
    config: Optional[dict[str, Any]] = None


class PlaygroundUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    config: Optional[dict[str, Any]] = None


@router.get("/", response_model=List[PlaygroundModel])
async def list_playgrounds(
    project_id: str,
    search: Optional[str] = None,
    limit: int = 50,
    session: AsyncSession = Depends(get_session),
):
    stmt = select(PlaygroundModel).where(PlaygroundModel.project_id == project_id)
    if search:
        stmt = stmt.where(PlaygroundModel.name.contains(search))
    stmt = stmt.order_by(PlaygroundModel.updated_at.desc()).limit(limit)
    res = await session.execute(stmt)
    return res.scalars().all()


@router.get("/{playground_id}", response_model=PlaygroundModel)
async def get_playground(
    playground_id: str,
    session: AsyncSession = Depends(get_session),
):
    playground = await session.get(PlaygroundModel, playground_id)
    if not playground:
        raise HTTPException(status_code=404, detail="Playground not found")
    return playground


@router.post("/", response_model=PlaygroundModel)
async def create_playground(
    payload: PlaygroundCreate,
    session: AsyncSession = Depends(get_session),
):
    stmt = select(PlaygroundModel).where(
        PlaygroundModel.project_id == payload.project_id,
        PlaygroundModel.name == payload.name,
    )
    res = await session.execute(stmt)
    if res.scalars().first():
        raise HTTPException(status_code=400, detail="Playground name already exists")

    now = int(time.time() * 1000)
    playground = PlaygroundModel(
        id=payload.id or f"pg_{uuid.uuid4().hex[:10]}",
        project_id=payload.project_id,
        name=payload.name,
        description=payload.description,
        config=payload.config or {},
        created_at=now,
        updated_at=now,
    )
    session.add(playground)
    await session.commit()
    await session.refresh(playground)
    return playground


@router.patch("/{playground_id}", response_model=PlaygroundModel)
async def update_playground(
    playground_id: str,
    payload: PlaygroundUpdate,
    session: AsyncSession = Depends(get_session),
):
    playground = await session.get(PlaygroundModel, playground_id)
    if not playground:
        raise HTTPException(status_code=404, detail="Playground not found")

    if payload.name is not None and payload.name != playground.name:
        stmt = select(PlaygroundModel).where(
            PlaygroundModel.project_id == playground.project_id,
            PlaygroundModel.name == payload.name,
        )
        res = await session.execute(stmt)
        if res.scalars().first():
            raise HTTPException(status_code=400, detail="Playground name already exists")
        playground.name = payload.name

    if payload.description is not None:
        playground.description = payload.description

    if payload.config is not None:
        playground.config = payload.config

    playground.updated_at = int(time.time() * 1000)
    session.add(playground)
    await session.commit()
    await session.refresh(playground)
    return playground


@router.delete("/{playground_id}", response_model=PlaygroundModel)
async def delete_playground(
    playground_id: str,
    session: AsyncSession = Depends(get_session),
):
    playground = await session.get(PlaygroundModel, playground_id)
    if not playground:
        raise HTTPException(status_code=404, detail="Playground not found")
    await session.delete(playground)
    await session.commit()
    return playground
