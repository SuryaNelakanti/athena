from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import uuid

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.database import get_session
from app.models import ModelRegistryModel
from app.services.proxy_service import ProxyService


router = APIRouter(prefix="/models", tags=["models"])


class ModelCreate(BaseModel):
    provider: str
    model_id: str
    display_name: Optional[str] = None
    enabled: bool = True


class ModelUpdate(BaseModel):
    enabled: Optional[bool] = None
    display_name: Optional[str] = None


class ModelSyncRequest(BaseModel):
    provider: Optional[str] = None  # openai/anthropic/gemini/mock, or null for all
    enable_new: bool = True


@router.get("", response_model=List[ModelRegistryModel])
async def list_models(
    enabled_only: bool = True,
    session: AsyncSession = Depends(get_session),
):
    statement = select(ModelRegistryModel)
    if enabled_only:
        statement = statement.where(ModelRegistryModel.enabled == True)  # noqa: E712
    result = await session.execute(statement.order_by(ModelRegistryModel.created_at.desc()))
    return result.scalars().all()


@router.post("", response_model=ModelRegistryModel)
async def create_model(
    payload: ModelCreate,
    session: AsyncSession = Depends(get_session),
):
    provider = payload.provider.strip().lower()
    model_id = payload.model_id.strip()
    if not provider or not model_id:
        raise HTTPException(status_code=400, detail="provider and model_id are required")

    if provider not in {"openai", "anthropic", "gemini", "mock"}:
        raise HTTPException(status_code=400, detail="Unsupported provider")

    # Unique (provider, model_id)
    existing_stmt = select(ModelRegistryModel).where(
        ModelRegistryModel.provider == provider,
        ModelRegistryModel.model_id == model_id,
    )
    existing = await session.execute(existing_stmt)
    if existing.scalars().first():
        raise HTTPException(status_code=400, detail="Model already exists in registry")

    row = ModelRegistryModel(
        id=f"mdl_{uuid.uuid4().hex[:8]}",
        provider=provider,
        model_id=model_id,
        display_name=payload.display_name,
        enabled=payload.enabled,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return row


@router.patch("/{model_registry_id}", response_model=ModelRegistryModel)
async def update_model(
    model_registry_id: str,
    payload: ModelUpdate,
    session: AsyncSession = Depends(get_session),
):
    row = await session.get(ModelRegistryModel, model_registry_id)
    if not row:
        raise HTTPException(status_code=404, detail="Model not found")

    if payload.enabled is not None:
        row.enabled = payload.enabled
    if payload.display_name is not None:
        row.display_name = payload.display_name

    session.add(row)
    await session.commit()
    await session.refresh(row)
    return row


@router.post("/sync", response_model=List[ModelRegistryModel])
async def sync_models(
    payload: ModelSyncRequest,
    session: AsyncSession = Depends(get_session),
):
    """
    Populates the curated model registry from provider discovery (`/v1/models` equivalent),
    optionally filtered to a single provider.
    """
    provider_filter = payload.provider.strip().lower() if payload.provider else None
    if provider_filter and provider_filter not in {"openai", "anthropic", "gemini", "mock"}:
        raise HTTPException(status_code=400, detail="Unsupported provider")

    service = ProxyService(session)
    discovered = await service.list_models()

    created_or_updated: list[ModelRegistryModel] = []
    for card in discovered:
        provider = (card.owned_by or "").strip().lower()
        model_id = (card.id or "").strip()
        if not provider or not model_id:
            continue
        if provider_filter and provider != provider_filter:
            continue

        stmt = select(ModelRegistryModel).where(
            ModelRegistryModel.provider == provider,
            ModelRegistryModel.model_id == model_id,
        )
        existing = await session.execute(stmt)
        row = existing.scalars().first()
        if row:
            if row.display_name is None:
                row.display_name = model_id
            created_or_updated.append(row)
            session.add(row)
            continue

        new_row = ModelRegistryModel(
            id=f"mdl_{uuid.uuid4().hex[:8]}",
            provider=provider,
            model_id=model_id,
            display_name=model_id,
            enabled=payload.enable_new,
        )
        session.add(new_row)
        created_or_updated.append(new_row)

    await session.commit()
    return created_or_updated
