from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Literal

from app.services.provider_keys import ProviderKeyStore


router = APIRouter(prefix="/providers", tags=["providers"])

SupportedProvider = Literal["openai", "anthropic", "gemini", "mock"]


class ProviderKeySetRequest(BaseModel):
    api_key: str


@router.get("", response_model=List[dict])
async def list_provider_statuses():
    providers = ["openai", "anthropic", "gemini", "mock"]
    return [ProviderKeyStore.status(p) for p in providers]


@router.post("/{provider}/apikey", response_model=dict)
async def set_provider_key(provider: SupportedProvider, payload: ProviderKeySetRequest):
    api_key = payload.api_key.strip()
    if not api_key:
        raise HTTPException(status_code=400, detail="api_key is required")

    ProviderKeyStore.set_key(provider, api_key)
    status = ProviderKeyStore.status(provider)
    return {**status, "api_key_last4": api_key[-4:]}


@router.delete("/{provider}/apikey", response_model=dict)
async def clear_provider_key(provider: SupportedProvider):
    ProviderKeyStore.clear_key(provider)
    return ProviderKeyStore.status(provider)

