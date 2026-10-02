import logging
import time
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.models import LogModel, SpanModel, TraceModel
from app.schemas.proxy import ChatCompletionRequest, ChatCompletionResponse
from app.services.job_service import JobService
from app.services.proxy_context import ProxyCallContext

logger = logging.getLogger(__name__)


class ProxyPersistenceService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def persist_successful_call(
        self,
        call: ProxyCallContext,
        request: ChatCompletionRequest,
        response: ChatCompletionResponse,
        project_id: str,
        provider_name: str,
        cost: Optional[float],
        *,
        cache_hit: bool = False,
        cache_encrypted: bool = False,
        cache_mode: Optional[str] = None,
    ) -> None:
        end_time = int(time.time() * 1000)
        latency_ms = end_time - call.start_time
        self._complete_span(
            call,
            response,
            cost,
            end_time,
            latency_ms,
            cache_hit,
            cache_encrypted,
        )
        self._complete_root_trace(call, response, cost, latency_ms)
        log = self._build_success_log(
            call,
            request,
            response,
            project_id,
            provider_name,
            cost,
            end_time,
            latency_ms,
            cache_hit,
            cache_encrypted,
            cache_mode,
        )
        await self.persist_call_records(call, log)
        await self.enqueue_log_score(log.id)

    def _complete_span(
        self,
        call: ProxyCallContext,
        response: ChatCompletionResponse,
        cost: Optional[float],
        end_time: int,
        latency_ms: int,
        cache_hit: bool,
        cache_encrypted: bool,
    ) -> None:
        call.span.end_time = end_time
        call.span.status = "success"
        call.span.output = response.model_dump(exclude_none=True)

        span_attributes = dict(call.span.attributes or {})
        if cache_hit:
            span_attributes.update({
                "cache_hit": True,
                "cache_encrypted": cache_encrypted,
            })
        if response.athena_reasoning:
            span_attributes.update({
                "reasoning_content": response.athena_reasoning,
                "reasoning_enabled": True,
            })
        call.span.attributes = span_attributes

        usage = response.usage
        if usage:
            if cost is not None:
                usage.cost = cost
            call.span.metrics = {
                "prompt_tokens": usage.prompt_tokens,
                "completion_tokens": usage.completion_tokens,
                "total_tokens": usage.total_tokens,
                "latency_ms": latency_ms,
                **({"cost": cost} if cost is not None else {}),
            }

    def _complete_root_trace(
        self,
        call: ProxyCallContext,
        response: ChatCompletionResponse,
        cost: Optional[float],
        latency_ms: int,
    ) -> None:
        if call.existing_trace:
            return

        if response.usage:
            call.trace.total_tokens = response.usage.total_tokens
            if cost is not None:
                call.trace.total_cost = cost
        call.trace.total_latency = latency_ms
        call.trace.status = "success"

    def _build_success_log(
        self,
        call: ProxyCallContext,
        request: ChatCompletionRequest,
        response: ChatCompletionResponse,
        project_id: str,
        provider_name: str,
        cost: Optional[float],
        end_time: int,
        latency_ms: int,
        cache_hit: bool,
        cache_encrypted: bool,
        cache_mode: Optional[str],
    ) -> LogModel:
        usage = response.usage
        log_attributes: dict[str, str | bool] = {
            "cache_hit": False,
            "has_reasoning": bool(response.athena_reasoning),
            "response_id": response.id,
        }
        message = f"LLM call to {request.model}"
        if cache_hit:
            log_attributes = {
                "cache_hit": True,
                "cache_encrypted": cache_encrypted,
                "cache_mode": cache_mode or "auto",
                "has_reasoning": bool(response.athena_reasoning),
            }
            message += " (cache)"

        log = LogModel(
            id=call.log_id,
            project_id=project_id,
            trace_id=call.trace_id,
            span_id=call.span_id,
            level="INFO",
            event_type="llm_call",
            status="success",
            message=message,
            timestamp=call.start_time,
            latency_ms=latency_ms,
            prompt_tokens=usage.prompt_tokens if usage else None,
            completion_tokens=usage.completion_tokens if usage else None,
            total_tokens=usage.total_tokens if usage else None,
            cost=cost,
            model=request.model,
            provider=provider_name,
            attributes=log_attributes,
            log_metadata={},
            created_at=end_time,
        )
        return log

    async def persist_call_records(self, call: ProxyCallContext, log: LogModel) -> None:
        self.session.add(log)
        self.session.add(call.span)
        self.session.add(call.trace)
        await self.session.commit()
        if call.existing_trace:
            await self.update_trace_aggregates(call.trace_id)
            await self.session.commit()

    async def persist_failed_call(
        self,
        call: ProxyCallContext,
        request: ChatCompletionRequest,
        project_id: str,
        provider_name: str,
        error: Exception,
        *,
        streaming: bool = False,
    ) -> None:
        end_time = int(time.time() * 1000)
        latency_ms = end_time - call.start_time
        call.span.end_time = end_time
        call.span.status = "error"
        call.span.error_message = str(error)
        if streaming:
            call.span.metrics = {"latency_ms": latency_ms}

        if not call.existing_trace:
            call.trace.status = "error"
            call.trace.total_latency = latency_ms

        log_attributes: dict[str, str | bool] = {"error": str(error)}
        event_type = "llm_call"
        call_kind = "call"
        if streaming:
            log_attributes["streaming"] = True
            event_type = "llm_stream"
            call_kind = "stream call"

        log = LogModel(
            id=call.log_id,
            project_id=project_id,
            trace_id=call.trace_id,
            span_id=call.span_id,
            level="ERROR",
            event_type=event_type,
            status="error",
            message=f"LLM {call_kind} to {request.model} failed: {error}",
            timestamp=call.start_time,
            latency_ms=latency_ms,
            model=request.model,
            provider=provider_name,
            attributes=log_attributes,
            log_metadata={},
            created_at=end_time,
        )
        await self.persist_call_records(call, log)

    async def enqueue_log_score(self, log_id: str) -> None:
        try:
            await JobService(self.session).create_job(
                kind="log_score",
                ref_id=log_id,
                payload={"source": "proxy"},
            )
        except Exception:
            logger.exception("Could not enqueue log scoring for %s", log_id)

    async def update_trace_aggregates(self, trace_id: str) -> None:
        """Recompute trace aggregates from all spans."""
        stmt = select(SpanModel).where(SpanModel.trace_id == trace_id)
        result = await self.session.execute(stmt)
        spans = result.scalars().all()
        if not spans:
            return

        total_tokens = sum((span.metrics or {}).get("total_tokens", 0) or 0 for span in spans)
        total_cost = sum((span.metrics or {}).get("cost", 0) or 0 for span in spans)
        start_times = [span.start_time for span in spans if span.start_time is not None]
        end_times = [span.end_time for span in spans if span.end_time is not None]
        total_latency = max(end_times) - min(start_times) if start_times and end_times else 0.0

        trace = await self.session.get(TraceModel, trace_id)
        if trace:
            trace.total_tokens = int(total_tokens)
            trace.total_cost = float(total_cost)
            trace.total_latency = float(total_latency)
            self.session.add(trace)
