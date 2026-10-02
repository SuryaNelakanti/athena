import logging
from typing import AsyncGenerator, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from app.providers.base import ProviderRequestError
from app.schemas.proxy import (
    ChatCompletionRequest,
    ChatCompletionResponse,
    ModelCard,
    ProviderConfig,
    Usage,
)
from app.providers.factory import get_envoy
from app.models import DatasetRowModel
from app.services.trace_service import extract_trace_io
from app.services.proxy_context import ProxyCallContext
from app.services.proxy_persistence import ProxyPersistenceService
from app.services.proxy_provider_service import ProxyProviderService
from app.services.proxy_response_cache import ProxyResponseCache
from app.services.proxy_streaming import ProxyStreamingService
from app.services.proxy_trace_service import ProxyTraceService

logger = logging.getLogger(__name__)


class ProxyService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.persistence = ProxyPersistenceService(session)
        self.response_cache = ProxyResponseCache()
        self.tracing = ProxyTraceService(session)
        self.providers = ProxyProviderService(session)
        self.streaming = ProxyStreamingService(
            session,
            self.persistence,
            self.tracing,
            self.providers,
        )

    async def _provider_config(
        self,
        provider_name: str,
        org_id: Optional[str] = None,
        project_id: Optional[str] = None,
    ) -> ProviderConfig | None:
        return await self.providers.provider_config(
            provider_name,
            org_id=org_id,
            project_id=project_id,
        )

    def resolve_provider(self, request: ChatCompletionRequest) -> str:
        return self.providers.resolve_provider(request.provider, request.model)

    def _env_float(self, key: str) -> Optional[float]:
        return self.providers.env_float(key)

    def _estimate_cost(self, usage: Optional[Usage]) -> Optional[float]:
        return self.providers.estimate_cost(usage)

    async def _persist_successful_completion(
        self,
        call: ProxyCallContext,
        request: ChatCompletionRequest,
        response: ChatCompletionResponse,
        project_id: str,
        provider_name: str,
        *,
        cache_hit: bool = False,
        cache_encrypted: bool = False,
        cache_mode: Optional[str] = None,
    ) -> None:
        await self.persistence.persist_successful_call(
            call,
            request,
            response,
            project_id,
            provider_name,
            self._estimate_cost(response.usage),
            cache_hit=cache_hit,
            cache_encrypted=cache_encrypted,
            cache_mode=cache_mode,
        )

    async def chat_completion(
        self,
        request: ChatCompletionRequest,
        project_id: str = "default",
        org_id: Optional[str] = None,
        bypass_cache: bool = False,
        parent_span_id: Optional[str] = None,
        cache_encryption_key: Optional[str] = None,
        cache_mode: Optional[str] = None,
        cache_ttl: Optional[int] = None,
    ) -> ChatCompletionResponse:
        provider_name = self.resolve_provider(request)
        provider_config = await self._provider_config(
            provider_name,
            org_id=org_id,
            project_id=project_id,
        )
        envoy = get_envoy(provider_name, provider_config)
        if cache_mode == "never":
            bypass_cache = True

        call = await self.tracing.start_call(
            request,
            project_id,
            provider_name,
            parent_span_id,
            bypass_cache=bypass_cache,
            cache_mode=cache_mode,
            cache_ttl=cache_ttl,
        )

        try:
            cache_request = None
            if not bypass_cache:
                cache_request = self.response_cache.prepare_request(
                    request,
                    provider_name,
                    cache_encryption_key,
                )
                cached_completion = await self.response_cache.get(cache_request)
            else:
                cached_completion = None

            if cached_completion is not None:
                response = cached_completion.response
                response.trace_id = call.trace_id
                response.span_id = call.span_id
                response.log_id = call.log_id
                await self._persist_successful_completion(
                    call,
                    request,
                    response,
                    project_id,
                    provider_name,
                    cache_hit=True,
                    cache_encrypted=cached_completion.encrypted,
                    cache_mode=cache_mode,
                )
                return response

            try:
                response = await envoy.chat_completion(request)
            except Exception as error:
                logger.warning(
                    "Provider %s completion failed (%s)",
                    provider_name,
                    type(error).__name__,
                )
                raise ProviderRequestError(provider_name) from error
            response.trace_id = call.trace_id
            response.span_id = call.span_id
            response.log_id = call.log_id
            await self._persist_successful_completion(
                call,
                request,
                response,
                project_id,
                provider_name,
            )

            if cache_request is not None:
                await self.response_cache.set(cache_request, response, ttl=cache_ttl)

            return response
        except Exception as error:
            await self.persistence.persist_failed_call(
                call,
                request,
                project_id,
                provider_name,
                error,
            )
            raise

    async def stream_chat_completion(
        self,
        request: ChatCompletionRequest,
        project_id: str = "default",
        org_id: Optional[str] = None,
        parent_span_id: Optional[str] = None,
    ) -> tuple[AsyncGenerator[str, None], str, str, str]:
        provider_name = self.resolve_provider(request)
        provider_config = await self._provider_config(
            provider_name,
            org_id=org_id,
            project_id=project_id,
        )
        envoy = get_envoy(provider_name, provider_config)
        return await self.streaming.stream_chat_completion(
            request,
            project_id,
            provider_name,
            parent_span_id,
            envoy,
        )

    async def list_models(self) -> list[ModelCard]:
        return await self.providers.list_models()

    async def promote_to_dataset(self, trace_id: str, dataset_id: str) -> DatasetRowModel:
        """
        Promotes canonical trace input/output to a dataset row.
        """
        from app.services.dataset_service import DatasetService
        input_data, output_data, input_span_id, output_span_id = await extract_trace_io(
            self.session,
            trace_id,
        )
        service = DatasetService(self.session)
        return await service.add_row(
            dataset_id=dataset_id,
            input_data=input_data,
            expected_data=output_data,
            meta={
                "source_trace_id": trace_id,
                "input_span_id": input_span_id,
                "output_span_id": output_span_id,
            },
            version_meta={
                "source": "trace",
                "trace_id": trace_id,
                "input_span_id": input_span_id,
                "output_span_id": output_span_id,
            },
        )
