from __future__ import annotations

import os
import time
import uuid
from dataclasses import dataclass
from typing import Optional, TypedDict

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.models import ProviderKeyModel
from app.services.provider_key_cipher import ProviderKeyCipher, ProviderKeyDecryptionError


class ProviderKeyStatus(TypedDict):
    provider: str
    configured: bool
    updated_at_ms: int | None


class ProviderKeyScope(TypedDict):
    org_id: str | None
    project_id: str | None


class DurableProviderKeyStatus(TypedDict):
    provider: str
    configured: bool
    scope: ProviderKeyScope
    api_key_last4: str | None
    updated_at_ms: int | None
    durable: bool


@dataclass(frozen=True)
class ProviderKeyInfo:
    api_key: str
    updated_at_ms: int


class ProviderKeyStore:
    """Manage process-local fallback keys and scoped durable provider keys.

    Durable keys use versioned authenticated encryption. Set a unique
    ``ATHENA_PROVIDER_KEY_SECRET`` outside local development; the default
    development secret preserves access to existing local values. Provider-key
    routes must be protected by deployment authentication and authorization.
    """

    _keys: dict[str, ProviderKeyInfo] = {}
    _ENVIRONMENT_KEY_ALIASES = {"gemini": ("GOOGLE_API_KEY",)}

    @classmethod
    def encrypt_key(cls, api_key: str) -> str:
        return ProviderKeyCipher.encrypt(api_key)

    @classmethod
    def decrypt_key(cls, encrypted_api_key: str) -> str:
        return ProviderKeyCipher.decrypt(encrypted_api_key)

    @classmethod
    def set_key(cls, provider: str, api_key: str) -> None:
        provider = provider.strip().lower()
        cls._keys[provider] = ProviderKeyInfo(api_key=api_key, updated_at_ms=int(time.time() * 1000))

    @classmethod
    def clear_key(cls, provider: str) -> None:
        provider = provider.strip().lower()
        cls._keys.pop(provider, None)

    @classmethod
    def _environment_key(cls, provider: str) -> str | None:
        env_keys = (
            f"{provider.upper()}_API_KEY",
            *cls._ENVIRONMENT_KEY_ALIASES.get(provider, ()),
        )
        return next((value for key in env_keys if (value := os.getenv(key))), None)

    @classmethod
    def get_key(cls, provider: str) -> Optional[str]:
        provider = provider.strip().lower()
        info = cls._keys.get(provider)
        if info:
            return info.api_key
        return cls._environment_key(provider)

    @classmethod
    def status(cls, provider: str) -> ProviderKeyStatus:
        provider = provider.strip().lower()
        info = cls._keys.get(provider)
        return {
            "provider": provider,
            "configured": bool(info and info.api_key),
            "updated_at_ms": info.updated_at_ms if info else None,
        }

    @classmethod
    async def set_durable_key(
        cls,
        session: AsyncSession,
        provider: str,
        api_key: str,
        org_id: Optional[str] = None,
        project_id: Optional[str] = None,
    ) -> ProviderKeyModel:
        provider = provider.strip().lower()
        now = int(time.time() * 1000)
        stmt = select(ProviderKeyModel).where(
            ProviderKeyModel.provider == provider,
            ProviderKeyModel.org_id == org_id,
            ProviderKeyModel.project_id == project_id,
        )
        result = await session.execute(stmt)
        model = result.scalar_one_or_none()
        if not model:
            model = ProviderKeyModel(
                id=f"pk_{uuid.uuid4().hex[:16]}",
                provider=provider,
                org_id=org_id,
                project_id=project_id,
                encrypted_api_key=cls.encrypt_key(api_key),
                api_key_last4=api_key[-4:],
                created_at=now,
                updated_at=now,
            )
        else:
            model.encrypted_api_key = cls.encrypt_key(api_key)
            model.api_key_last4 = api_key[-4:]
            model.updated_at = now
            model.revoked_at = None
        session.add(model)
        return model

    @classmethod
    async def clear_durable_key(
        cls,
        session: AsyncSession,
        provider: str,
        org_id: Optional[str] = None,
        project_id: Optional[str] = None,
    ) -> Optional[ProviderKeyModel]:
        provider = provider.strip().lower()
        stmt = select(ProviderKeyModel).where(
            ProviderKeyModel.provider == provider,
            ProviderKeyModel.org_id == org_id,
            ProviderKeyModel.project_id == project_id,
            ProviderKeyModel.revoked_at == None,  # noqa: E711
        )
        result = await session.execute(stmt)
        model = result.scalar_one_or_none()
        if model:
            model.revoked_at = int(time.time() * 1000)
            model.updated_at = model.revoked_at
            session.add(model)
        return model

    @classmethod
    async def get_durable_key(
        cls,
        session: AsyncSession,
        provider: str,
        org_id: Optional[str] = None,
        project_id: Optional[str] = None,
    ) -> Optional[str]:
        provider = provider.strip().lower()
        scopes = [
            (org_id, project_id),
            (org_id, None),
            (None, None),
        ]
        for scope_org_id, scope_project_id in scopes:
            stmt = select(ProviderKeyModel).where(
                ProviderKeyModel.provider == provider,
                ProviderKeyModel.org_id == scope_org_id,
                ProviderKeyModel.project_id == scope_project_id,
                ProviderKeyModel.revoked_at == None,  # noqa: E711
            )
            result = await session.execute(stmt)
            model = result.scalar_one_or_none()
            if model:
                return cls.decrypt_key(model.encrypted_api_key)
        return cls.get_key(provider)

    @classmethod
    async def durable_statuses(
        cls,
        session: AsyncSession,
        providers: list[str],
        org_id: Optional[str] = None,
        project_id: Optional[str] = None,
    ) -> list[DurableProviderKeyStatus]:
        statuses: list[DurableProviderKeyStatus] = []
        for provider in providers:
            stmt = select(ProviderKeyModel).where(
                ProviderKeyModel.provider == provider,
                ProviderKeyModel.org_id == org_id,
                ProviderKeyModel.project_id == project_id,
                ProviderKeyModel.revoked_at == None,  # noqa: E711
            )
            result = await session.execute(stmt)
            model = result.scalar_one_or_none()
            fallback = cls.status(provider)
            environment_key = cls._environment_key(provider)
            statuses.append(
                {
                    "provider": provider,
                    "configured": bool(model or fallback["configured"] or environment_key),
                    "scope": {
                        "org_id": org_id,
                        "project_id": project_id,
                    },
                    "api_key_last4": model.api_key_last4 if model else None,
                    "updated_at_ms": model.updated_at if model else fallback["updated_at_ms"],
                    "durable": bool(model),
                }
            )
        return statuses
