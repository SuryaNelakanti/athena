import pytest

from app.services.cache import CacheService


@pytest.mark.asyncio
async def test_cache_encryption_roundtrip():
    cache = CacheService()
    key = b"a" * 32
    value = {"answer": 42, "choices": []}

    await cache.set(
        model="mock-model",
        messages=[{"role": "user", "content": "hello"}],
        response=value,
        encryption_key=key,
    )

    result = await cache.get(
        model="mock-model",
        messages=[{"role": "user", "content": "hello"}],
        encryption_key=key,
    )

    assert result == value


@pytest.mark.asyncio
async def test_cache_encryption_wrong_key():
    cache = CacheService()
    key = b"a" * 32
    wrong_key = b"b" * 32
    value = {"answer": 42, "choices": []}

    await cache.set(
        model="mock-model",
        messages=[{"role": "user", "content": "hello"}],
        response=value,
        encryption_key=key,
    )

    result = await cache.get(
        model="mock-model",
        messages=[{"role": "user", "content": "hello"}],
        encryption_key=wrong_key,
    )

    assert result is None
