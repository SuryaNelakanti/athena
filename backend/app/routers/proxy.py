from fastapi import APIRouter, Depends, HTTPException, Header
from fastapi.responses import StreamingResponse, JSONResponse
from typing import Annotated, Optional

from sqlmodel import Session
from app.database import get_session
from app.schemas.proxy import ChatCompletionRequest, ChatCompletionResponse, ModelListResponse
from app.services.proxy_service import ProxyService
from app.services.cache import get_cache

router = APIRouter(prefix="/v1")

@router.post("/chat/completions")
async def chat_completions(
    request: ChatCompletionRequest,
    session: Session = Depends(get_session),
    authorization: Annotated[str | None, Header()] = None,
    x_athena_project_id: Annotated[Optional[str], Header()] = None,
    x_athena_trace_id: Annotated[Optional[str], Header()] = None,
    x_athena_parent_span_id: Annotated[Optional[str], Header()] = None,
    x_athena_cache_control: Annotated[Optional[str], Header()] = None,  # "no-cache" to bypass
    x_athena_cache_key: Annotated[Optional[str], Header()] = None,  # base64url/hex 32-byte key
):
    service = ProxyService(session)
    
    # Priority: header > request body > fallback
    project_id = x_athena_project_id or getattr(request, 'project_id', None) or "proj_default"
    
    # Pass trace_id from header to request if provided (for parent context)
    if x_athena_trace_id and not request.trace_id:
        request.trace_id = x_athena_trace_id
    if x_athena_parent_span_id and not request.parent_span_id:
        request.parent_span_id = x_athena_parent_span_id

    # Check cache bypass
    bypass_cache = x_athena_cache_control == "no-cache"

    try:
        if request.stream:
            # For streaming, headers are sent with the SSE response
            # The trace context will be in the first chunk or aggregated output
            return StreamingResponse(
                service.stream_chat_completion(
                    request,
                    project_id,
                    parent_span_id=request.parent_span_id,
                ),
                media_type="text/event-stream"
            )
        else:
            response = await service.chat_completion(
                request,
                project_id,
                bypass_cache=bypass_cache,
                parent_span_id=request.parent_span_id,
                cache_encryption_key=x_athena_cache_key,
            )
            
            # Return response with trace context headers for client correlation
            headers = {}
            if response.trace_id:
                headers["X-Athena-Trace-ID"] = response.trace_id
            if response.span_id:
                headers["X-Athena-Span-ID"] = response.span_id
            
            return JSONResponse(
                content=response.model_dump(exclude_none=True),
                headers=headers
            )
            
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        # TODO: Better error handling/mapping
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/models", response_model=ModelListResponse)
async def list_models(session: Session = Depends(get_session)):
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

