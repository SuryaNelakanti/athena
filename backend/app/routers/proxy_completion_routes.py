import logging
from dataclasses import dataclass
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models import SpanModel
from app.providers.base import ProviderRequestError
from app.schemas.proxy import ChatCompletionRequest
from app.services.proxy_service import ProxyService

router = APIRouter()
logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ProxyCacheOptions:
    mode: str
    bypass: bool
    ttl: Optional[int]


def _project_id(request: ChatCompletionRequest, header_project_id: Optional[str]) -> str:
    return header_project_id or getattr(request, "project_id", None) or "proj_default"


def _apply_trace_context(
    request: ChatCompletionRequest,
    trace_id: Optional[str],
    parent_header: Optional[str],
) -> None:
    if trace_id and not request.trace_id:
        request.trace_id = trace_id
    if parent_header and not request.parent_span_id:
        request.parent_span_id = parent_header


def _cache_options(
    cache_control: Optional[str],
    use_cache: Optional[str],
    cache_ttl_header: Optional[str],
) -> ProxyCacheOptions:
    mode = (use_cache or "auto").strip().lower()
    if mode not in {"auto", "always", "never"}:
        raise HTTPException(
            status_code=400,
            detail="X-Athena-Use-Cache must be auto, always, or never",
        )
    bypass = cache_control == "no-cache" or mode == "never"
    ttl = None
    if cache_ttl_header:
        try:
            ttl = int(cache_ttl_header)
        except ValueError as error:
            raise HTTPException(
                status_code=400,
                detail="X-Athena-Cache-TTL must be an integer",
            ) from error
    return ProxyCacheOptions(mode=mode, bypass=bypass, ttl=ttl)


async def _streaming_response(
    service: ProxyService,
    request: ChatCompletionRequest,
    project_id: str,
    org_id: Optional[str],
) -> StreamingResponse:
    stream, trace_id, span_id, log_id = await service.stream_chat_completion(
        request,
        project_id,
        org_id=org_id,
        parent_span_id=request.parent_span_id,
    )
    headers = {
        "X-Athena-Project-ID": project_id,
        "X-Athena-Used-Provider": service.resolve_provider(request),
        "X-Athena-Cached": "false",
    }
    if trace_id:
        headers["X-Athena-Trace-ID"] = trace_id
    if span_id:
        headers["X-Athena-Span-ID"] = span_id
    if log_id:
        headers["X-Athena-Log-ID"] = log_id
    return StreamingResponse(stream, media_type="text/event-stream", headers=headers)


async def _completion_response(
    session: AsyncSession,
    service: ProxyService,
    request: ChatCompletionRequest,
    project_id: str,
    org_id: Optional[str],
    cache_options: ProxyCacheOptions,
    cache_encryption_key: Optional[str],
) -> JSONResponse:
    response = await service.chat_completion(
        request,
        project_id,
        org_id=org_id,
        bypass_cache=cache_options.bypass,
        parent_span_id=request.parent_span_id,
        cache_encryption_key=cache_encryption_key,
        cache_mode=cache_options.mode,
        cache_ttl=cache_options.ttl,
    )
    span = await session.get(SpanModel, response.span_id) if response.span_id else None
    headers = {
        "X-Athena-Project-ID": project_id,
        "X-Athena-Used-Provider": response.provider or service.resolve_provider(request),
        "X-Athena-Cached": "true" if span and (span.attributes or {}).get("cache_hit") else "false",
    }
    if response.trace_id:
        headers["X-Athena-Trace-ID"] = response.trace_id
    if response.span_id:
        headers["X-Athena-Span-ID"] = response.span_id
    if response.log_id:
        headers["X-Athena-Log-ID"] = response.log_id
    return JSONResponse(
        content=response.model_dump(exclude_none=True),
        headers=headers,
    )


@router.post("/chat/completions")
async def chat_completions(
    request: ChatCompletionRequest,
    session: AsyncSession = Depends(get_session),
    authorization: Annotated[str | None, Header()] = None,
    x_athena_org_id: Annotated[Optional[str], Header()] = None,
    x_athena_project_id: Annotated[Optional[str], Header()] = None,
    x_athena_parent: Annotated[Optional[str], Header()] = None,
    x_athena_trace_id: Annotated[Optional[str], Header()] = None,
    x_athena_parent_span_id: Annotated[Optional[str], Header()] = None,
    x_athena_cache_control: Annotated[Optional[str], Header()] = None,  # "no-cache" to bypass
    x_athena_use_cache: Annotated[Optional[str], Header()] = None,  # auto | always | never
    x_athena_cache_ttl: Annotated[Optional[str], Header()] = None,
    x_athena_cache_key: Annotated[Optional[str], Header()] = None,  # base64url/hex 32-byte key
):
    service = ProxyService(session)
    project_id = _project_id(request, x_athena_project_id)
    _apply_trace_context(
        request,
        x_athena_trace_id,
        x_athena_parent_span_id or x_athena_parent,
    )
    cache_options = _cache_options(
        x_athena_cache_control,
        x_athena_use_cache,
        x_athena_cache_ttl,
    )

    try:
        if request.stream:
            return await _streaming_response(service, request, project_id, x_athena_org_id)
        return await _completion_response(
            session,
            service,
            request,
            project_id,
            x_athena_org_id,
            cache_options,
            x_athena_cache_key,
        )
    except ProviderRequestError as error:
        raise HTTPException(
            status_code=502,
            detail=str(error),
            headers={
                "X-Athena-Error-Origin": "provider",
                "X-Athena-Used-Provider": error.provider_name,
            },
        ) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    except Exception as error:
        logger.exception("Proxy gateway failed while processing a completion")
        raise HTTPException(
            status_code=500,
            detail="The proxy gateway could not process the request.",
            headers={"X-Athena-Error-Origin": "gateway"},
        ) from error
