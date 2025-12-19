from __future__ import annotations

from dataclasses import dataclass
from typing import Optional
import time


@dataclass
class ProviderKeyInfo:
    api_key: str
    updated_at_ms: int


class ProviderKeyStore:
    """
    Local-only, in-memory provider key store.

    SECURITY NOTE:
    - This does not persist to disk (no secrets-at-rest).
    - This assumes a trusted local environment; do not expose the API publicly without auth/RBAC.
    """

    _keys: dict[str, ProviderKeyInfo] = {}

    @classmethod
    def set_key(cls, provider: str, api_key: str) -> None:
        provider = provider.strip().lower()
        cls._keys[provider] = ProviderKeyInfo(api_key=api_key, updated_at_ms=int(time.time() * 1000))

    @classmethod
    def clear_key(cls, provider: str) -> None:
        provider = provider.strip().lower()
        cls._keys.pop(provider, None)

    @classmethod
    def get_key(cls, provider: str) -> Optional[str]:
        provider = provider.strip().lower()
        info = cls._keys.get(provider)
        return info.api_key if info else None

    @classmethod
    def status(cls, provider: str) -> dict:
        provider = provider.strip().lower()
        info = cls._keys.get(provider)
        return {
            "provider": provider,
            "configured": bool(info and info.api_key),
            "updated_at_ms": info.updated_at_ms if info else None,
        }

