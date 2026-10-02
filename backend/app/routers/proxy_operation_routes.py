from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.schemas.proxy import ModelListResponse
from app.services.cache import get_cache
from app.services.proxy_service import ProxyService

router = APIRouter()


@router.get("/models", response_model=ModelListResponse)
async def list_models(session: AsyncSession = Depends(get_session)):
    service = ProxyService(session)
    models = await service.list_models()
    return ModelListResponse(data=models)

@router.get("/cache/stats")
async def get_cache_stats():
    """Get cache statistics."""
    cache = get_cache()
    return cache.get_stats()

@router.post("/cache/clear")
async def clear_cache():
    """Clear the cache."""
    cache = get_cache()
    await cache.clear()
    return {"status": "success", "message": "Cache cleared"}

@router.post("/cache/toggle")
async def toggle_cache(enabled: bool = True):
    """Enable or disable the cache."""
    cache = get_cache()
    if enabled:
        cache.enable()
    else:
        cache.disable()
    return {"status": "success", "enabled": cache.enabled}
