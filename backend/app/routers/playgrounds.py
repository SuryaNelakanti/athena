from typing import List, Optional, Any
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from ..database import get_session
from ..models import ExperimentModel, ExperimentVersionModel, PlaygroundModel

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


class PlaygroundRunRequest(BaseModel):
    variants: Optional[List[dict[str, Any]]] = None
    input: Optional[Any] = None
    dataset_id: Optional[str] = None
    trace: bool = True


class PlaygroundPromoteRequest(BaseModel):
    name: Optional[str] = None
    dataset_id: str


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


@router.post("/{playground_id}/run")
async def run_playground(
    playground_id: str,
    payload: PlaygroundRunRequest,
    session: AsyncSession = Depends(get_session),
):
    playground = await session.get(PlaygroundModel, playground_id)
    if not playground:
        raise HTTPException(status_code=404, detail="Playground not found")
    variants = payload.variants or (playground.config or {}).get("variants") or []
    if not variants:
        variants = [{"id": "default", "name": "Default", "model": (playground.config or {}).get("model", "mock-model-v1")}]
    now = int(time.time() * 1000)
    runs = []
    for variant in variants:
        variant_id = variant.get("id") or f"variant_{uuid.uuid4().hex[:8]}"
        output_text = variant.get("mock_output") or f"Playground run for {variant.get('name') or variant_id}"
        runs.append({
            "id": f"pgrun_{uuid.uuid4().hex[:12]}",
            "playground_id": playground_id,
            "variant_id": variant_id,
            "variant": variant,
            "input": payload.input,
            "output": {"text": output_text},
            "scores": {},
            "trace_id": None,
            "created_at": now,
        })
    playground.config = {
        **(playground.config or {}),
        "last_run": {
            "created_at": now,
            "dataset_id": payload.dataset_id,
            "runs": runs,
        },
    }
    playground.updated_at = now
    session.add(playground)
    await session.commit()
    await session.refresh(playground)
    return {"playground_id": playground_id, "runs": runs}


@router.post("/{playground_id}/promote", response_model=ExperimentModel)
async def promote_playground(
    playground_id: str,
    payload: PlaygroundPromoteRequest,
    session: AsyncSession = Depends(get_session),
):
    playground = await session.get(PlaygroundModel, playground_id)
    if not playground:
        raise HTTPException(status_code=404, detail="Playground not found")
    now = int(time.time() * 1000)
    experiment = ExperimentModel(
        id=f"exp_{uuid.uuid4().hex[:10]}",
        project_id=playground.project_id,
        dataset_id=payload.dataset_id,
        name=payload.name or f"{playground.name} experiment",
        status="pending",
        summary={"source_playground_id": playground.id},
        created_at=now,
    )
    session.add(experiment)
    version = ExperimentVersionModel(
        id=f"ver_{uuid.uuid4().hex[:10]}",
        experiment_id=experiment.id,
        version_number=1,
        dataset_version_pinned=1,
        config={
            "source": "playground",
            "playground_id": playground.id,
            **(playground.config or {}),
        },
        created_at=now,
    )
    session.add(version)
    await session.commit()
    await session.refresh(experiment)
    return experiment


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
