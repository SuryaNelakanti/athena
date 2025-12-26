from typing import List, Optional
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from ..database import get_session
from ..models import EnvironmentModel

router = APIRouter(prefix="/environments", tags=["environments"])


class EnvironmentCreate(BaseModel):
    project_id: str
    name: str
    description: Optional[str] = None
    is_default: Optional[bool] = False


class EnvironmentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_default: Optional[bool] = None


@router.get("/", response_model=List[EnvironmentModel])
async def list_environments(
    project_id: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
):
    stmt = select(EnvironmentModel)
    if project_id:
        stmt = stmt.where(EnvironmentModel.project_id == project_id)
    stmt = stmt.order_by(EnvironmentModel.created_at.desc())
    res = await session.execute(stmt)
    return res.scalars().all()


@router.get("/{environment_id}", response_model=EnvironmentModel)
async def get_environment(
    environment_id: str,
    session: AsyncSession = Depends(get_session),
):
    environment = await session.get(EnvironmentModel, environment_id)
    if not environment:
        raise HTTPException(status_code=404, detail="Environment not found")
    return environment


@router.post("/", response_model=EnvironmentModel)
async def create_environment(
    payload: EnvironmentCreate,
    session: AsyncSession = Depends(get_session),
):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")

    now_ms = int(time.time() * 1000)
    if payload.is_default:
        stmt = select(EnvironmentModel).where(
            EnvironmentModel.project_id == payload.project_id,
            EnvironmentModel.is_default == True,  # noqa: E712
        )
        res = await session.execute(stmt)
        for env in res.scalars().all():
            env.is_default = False
            env.updated_at = now_ms
            session.add(env)

    environment = EnvironmentModel(
        id=f"env_{uuid.uuid4().hex[:10]}",
        project_id=payload.project_id,
        name=name,
        description=payload.description,
        is_default=bool(payload.is_default),
        created_at=now_ms,
        updated_at=now_ms,
    )
    session.add(environment)
    await session.commit()
    await session.refresh(environment)
    return environment


@router.patch("/{environment_id}", response_model=EnvironmentModel)
async def update_environment(
    environment_id: str,
    payload: EnvironmentUpdate,
    session: AsyncSession = Depends(get_session),
):
    environment = await session.get(EnvironmentModel, environment_id)
    if not environment:
        raise HTTPException(status_code=404, detail="Environment not found")

    now_ms = int(time.time() * 1000)
    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="name cannot be empty")
        environment.name = name
    if payload.description is not None:
        environment.description = payload.description
    if payload.is_default is not None:
        if payload.is_default:
            stmt = select(EnvironmentModel).where(
                EnvironmentModel.project_id == environment.project_id,
                EnvironmentModel.is_default == True,  # noqa: E712
            )
            res = await session.execute(stmt)
            for env in res.scalars().all():
                if env.id != environment.id:
                    env.is_default = False
                    env.updated_at = now_ms
                    session.add(env)
        environment.is_default = payload.is_default

    environment.updated_at = now_ms
    session.add(environment)
    await session.commit()
    await session.refresh(environment)
    return environment


@router.delete("/{environment_id}")
async def delete_environment(
    environment_id: str,
    session: AsyncSession = Depends(get_session),
):
    environment = await session.get(EnvironmentModel, environment_id)
    if not environment:
        raise HTTPException(status_code=404, detail="Environment not found")
    await session.delete(environment)
    await session.commit()
    return {"status": "success"}
