import logging
import time
from typing import AsyncGenerator, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import LogModel
from app.providers.base import ProviderRequestError, TitanEnvoy
from app.schemas.proxy import ChatCompletionChunk, ChatCompletionRequest, Usage
from app.services.proxy_context import ProxyCallContext
from app.services.proxy_persistence import ProxyPersistenceService
from app.services.proxy_provider_service import ProxyProviderService
from app.services.proxy_trace_service import ProxyTraceService

logger = logging.getLogger(__name__)


class ProxyStreamingService:
    """Own trace lifecycle, SSE output, and persistence for streamed completions."""

    def __init__(
        self,
        session: AsyncSession,
        persistence: ProxyPersistenceService,
        tracing: ProxyTraceService,
        providers: ProxyProviderService,
    ):
        self.session = session
        self.persistence = persistence
        self.tracing = tracing
        self.providers = providers

    async def stream_chat_completion(
        self,
        request: ChatCompletionRequest,
        project_id: str,
        provider_name: str,
        parent_span_id: Optional[str],
        envoy: TitanEnvoy,
    ) -> tuple[AsyncGenerator[str, None], str, str, str]:
        call = await self.tracing.start_call(
            request,
            project_id,
            provider_name,
            parent_span_id,
            streaming=True,
        )
        await self.session.commit()

        async def event_stream() -> AsyncGenerator[str, None]:
            content_parts: list[str] = []
            reasoning_parts: list[str] = []
            stream_response_id: Optional[str] = None
            stream_usage: Optional[Usage] = None

            try:
                async for chunk in self._provider_chunks(envoy, request, provider_name):
                    if not stream_response_id:
                        stream_response_id = chunk.id
                    if chunk.usage:
                        stream_usage = chunk.usage

                    if chunk.choices:
                        for choice in chunk.choices:
                            if choice.delta and choice.delta.content:
                                content_parts.append(choice.delta.content)
                            if choice.delta and choice.delta.reasoning_content:
                                reasoning_parts.append(choice.delta.reasoning_content)

                    chunk.trace_id = call.trace_id
                    chunk.span_id = call.span_id
                    chunk.log_id = call.log_id
                    yield f"data: {chunk.model_dump_json(exclude_none=True)}\n\n"

                end_time = int(time.time() * 1000)
                latency_ms = end_time - call.start_time
                cost = self.providers.estimate_cost(stream_usage)
                if stream_usage:
                    if cost is not None:
                        stream_usage.cost = cost
                    stream_usage.latency_ms = latency_ms
                output = self._build_stream_output(
                    request,
                    provider_name,
                    call.trace_id,
                    stream_response_id,
                    content_parts,
                    reasoning_parts,
                    stream_usage,
                )
                await self._persist_successful_stream(
                    call,
                    request,
                    project_id,
                    provider_name,
                    output,
                    end_time,
                    latency_ms,
                    bool(reasoning_parts),
                    stream_usage,
                    cost,
                )
                yield "data: [DONE]\n\n"
            except Exception as error:
                await self.persistence.persist_failed_call(
                    call,
                    request,
                    project_id,
                    provider_name,
                    error,
                    streaming=True,
                )
                raise

        return event_stream(), call.trace_id, call.span_id, call.log_id

    async def _provider_chunks(
        self,
        envoy: TitanEnvoy,
        request: ChatCompletionRequest,
        provider_name: str,
    ) -> AsyncGenerator[ChatCompletionChunk, None]:
        try:
            async for chunk in envoy.stream_chat_completion(request):
                yield chunk
        except ProviderRequestError:
            raise
        except Exception as error:
            logger.warning(
                "Provider %s stream failed (%s)",
                provider_name,
                type(error).__name__,
            )
            raise ProviderRequestError(provider_name) from error

    def _build_stream_output(
        self,
        request: ChatCompletionRequest,
        provider_name: str,
        trace_id: str,
        response_id: Optional[str],
        content_parts: list[str],
        reasoning_parts: list[str],
        usage: Optional[Usage],
    ) -> dict[str, object]:
        output: dict[str, object] = {
            "id": response_id or f"stream-{trace_id}",
            "object": "chat.completion",
            "created": int(time.time()),
            "model": request.model,
            "choices": [
                {
                    "index": 0,
                    "message": {"role": "assistant", "content": "".join(content_parts)},
                    "finish_reason": "stop",
                }
            ],
            "provider": provider_name,
        }
        if usage:
            output["usage"] = usage.model_dump(exclude_none=True)
        reasoning = "".join(reasoning_parts)
        if reasoning:
            output["athena_reasoning"] = reasoning
        return output

    async def _persist_successful_stream(
        self,
        call: ProxyCallContext,
        request: ChatCompletionRequest,
        project_id: str,
        provider_name: str,
        output: dict[str, object],
        end_time: int,
        latency_ms: int,
        has_reasoning: bool,
        usage: Optional[Usage],
        cost: Optional[float],
    ) -> None:
        call.span.end_time = end_time
        call.span.status = "success"
        call.span.metrics = {
            "latency_ms": latency_ms,
            **(
                {
                    "prompt_tokens": usage.prompt_tokens,
                    "completion_tokens": usage.completion_tokens,
                    "total_tokens": usage.total_tokens,
                }
                if usage
                else {}
            ),
            **({"cost": cost} if cost is not None else {}),
        }
        call.span.output = output
        span_attributes = dict(call.span.attributes or {})
        span_attributes["reasoning_enabled"] = has_reasoning
        if has_reasoning:
            span_attributes["reasoning_content"] = output["athena_reasoning"]
        call.span.attributes = span_attributes

        if not call.existing_trace:
            call.trace.total_latency = latency_ms
            if usage:
                call.trace.total_tokens = usage.total_tokens
            if cost is not None:
                call.trace.total_cost = cost
            call.trace.status = "success"

        log = LogModel(
            id=call.log_id,
            project_id=project_id,
            trace_id=call.trace_id,
            span_id=call.span_id,
            level="INFO",
            event_type="llm_stream",
            status="success",
            message=f"LLM stream call to {request.model}",
            timestamp=call.start_time,
            latency_ms=latency_ms,
            prompt_tokens=usage.prompt_tokens if usage else None,
            completion_tokens=usage.completion_tokens if usage else None,
            total_tokens=usage.total_tokens if usage else None,
            cost=cost,
            model=request.model,
            provider=provider_name,
            attributes={
                "streaming": True,
                "has_reasoning": has_reasoning,
                "response_id": output["id"],
            },
            log_metadata={},
            created_at=end_time,
        )
        await self.persistence.persist_call_records(call, log)
        await self.persistence.enqueue_log_score(log.id)
