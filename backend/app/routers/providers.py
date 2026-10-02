from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.services.provider_keys import ProviderKeyStore


router = APIRouter(prefix="/providers", tags=["providers"])

SupportedProvider = Literal["openai", "anthropic", "gemini", "groq", "mock"]


class ProviderKeySetRequest(BaseModel):
    api_key: str
    org_id: Optional[str] = None
    project_id: Optional[str] = None


class ProviderScopeResponse(BaseModel):
    org_id: Optional[str]
    project_id: Optional[str]


class ProviderStatusResponse(BaseModel):
    provider: SupportedProvider
    configured: bool
    scope: ProviderScopeResponse
    api_key_last4: Optional[str]
    updated_at_ms: Optional[int]
    durable: bool


class InMemoryProviderKeyResponse(BaseModel):
    provider: SupportedProvider
    configured: bool
    updated_at_ms: Optional[int]
    api_key_last4: str
    durable: bool


class DurableProviderKeyResponse(BaseModel):
    provider: SupportedProvider
    configured: bool
    durable: bool
    org_id: Optional[str]
    project_id: Optional[str]
    api_key_last4: str
    updated_at_ms: int


class ProviderKeyClearedResponse(BaseModel):
    provider: SupportedProvider
    configured: bool
    org_id: Optional[str]
    project_id: Optional[str]


@router.get("", response_model=list[ProviderStatusResponse])
async def list_provider_statuses(
    org_id: Optional[str] = Query(default=None),
    project_id: Optional[str] = Query(default=None),
    session: AsyncSession = Depends(get_session),
):
    providers = ["openai", "anthropic", "gemini", "groq", "mock"]
    return await ProviderKeyStore.durable_statuses(session, providers, org_id=org_id, project_id=project_id)


@router.post("/{provider}/apikey", response_model=InMemoryProviderKeyResponse)
async def set_provider_key(provider: SupportedProvider, payload: ProviderKeySetRequest):
    api_key = payload.api_key.strip()
    if not api_key:
        raise HTTPException(status_code=400, detail="api_key is required")

    ProviderKeyStore.set_key(provider, api_key)
    status = ProviderKeyStore.status(provider)
    return {**status, "api_key_last4": api_key[-4:], "durable": False}


@router.post("/{provider}/keys", response_model=DurableProviderKeyResponse)
async def set_durable_provider_key(
    provider: SupportedProvider,
    payload: ProviderKeySetRequest,
    session: AsyncSession = Depends(get_session),
):
    api_key = payload.api_key.strip()
    if not api_key:
        raise HTTPException(status_code=400, detail="api_key is required")

    model = await ProviderKeyStore.set_durable_key(
        session,
        provider,
        api_key,
        org_id=payload.org_id,
        project_id=payload.project_id,
    )
    await session.commit()
    if payload.org_id is None and payload.project_id is None:
        ProviderKeyStore.set_key(provider, api_key)
    await session.refresh(model)
    return {
        "provider": provider,
        "configured": True,
        "durable": True,
        "org_id": model.org_id,
        "project_id": model.project_id,
        "api_key_last4": model.api_key_last4,
        "updated_at_ms": model.updated_at,
    }


@router.delete("/{provider}/apikey", response_model=ProviderKeyClearedResponse)
async def clear_provider_key(
    provider: SupportedProvider,
    org_id: Optional[str] = Query(default=None),
    project_id: Optional[str] = Query(default=None),
    session: AsyncSession = Depends(get_session),
):
    await ProviderKeyStore.clear_durable_key(session, provider, org_id=org_id, project_id=project_id)
    await session.commit()
    if org_id is None and project_id is None:
        ProviderKeyStore.clear_key(provider)
    return {
        "provider": provider,
        "configured": False,
        "org_id": org_id,
        "project_id": project_id,
    }
