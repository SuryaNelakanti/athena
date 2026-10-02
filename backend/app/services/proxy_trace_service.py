import time
import uuid
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import SpanModel, SpanType, TraceModel
from app.schemas.proxy import ChatCompletionRequest
from app.services.proxy_context import ProxyCallContext


class ProxyTraceService:
    """Create trace and span records for proxy inference calls."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def _resolve_trace_context(
        self,
        requested_trace_id: Optional[str],
        requested_parent_span_id: Optional[str],
    ) -> tuple[str, Optional[str], Optional[str], Optional[TraceModel]]:
        """Return IDs for a reusable trace or a new child trace.

        A requested trace is reused only when the requested parent span belongs to it.
        Otherwise the requested trace becomes the parent of a new trace.
        """
        if not requested_trace_id:
            return str(uuid.uuid4()), None, None, None

        existing_trace = await self.session.get(TraceModel, requested_trace_id)
        if existing_trace:
            if requested_parent_span_id:
                parent_span = await self.session.get(SpanModel, requested_parent_span_id)
                if parent_span and parent_span.trace_id == existing_trace.id:
                    return existing_trace.id, None, requested_parent_span_id, existing_trace
            return str(uuid.uuid4()), requested_trace_id, None, None

        return requested_trace_id, None, None, None

    async def start_call(
        self,
        request: ChatCompletionRequest,
        project_id: str,
        provider_name: str,
        parent_span_id: Optional[str],
        *,
        streaming: bool = False,
        bypass_cache: bool = False,
        cache_mode: Optional[str] = None,
        cache_ttl: Optional[int] = None,
    ) -> ProxyCallContext:
        trace_id, parent_trace_id, resolved_parent_span_id, existing_trace = (
            await self._resolve_trace_context(request.trace_id, parent_span_id)
        )
        span_id = str(uuid.uuid4())
        log_id = f"log_{uuid.uuid4().hex[:16]}"
        start_time = int(time.time() * 1000)
        if existing_trace is None:
            trace = await self._create_trace(
                request,
                project_id,
                provider_name,
                trace_id,
                parent_trace_id,
                span_id,
                start_time,
                streaming,
            )
        else:
            trace = existing_trace

        span = self._build_call_span(
            request,
            provider_name,
            trace_id,
            span_id,
            resolved_parent_span_id,
            parent_trace_id,
            start_time,
            streaming,
            bypass_cache,
            cache_mode,
            cache_ttl,
        )
        self.session.add(span)
        return ProxyCallContext(
            trace_id=trace_id,
            span_id=span_id,
            log_id=log_id,
            start_time=start_time,
            existing_trace=existing_trace,
            trace=trace,
            span=span,
        )

    async def _create_trace(
        self,
        request: ChatCompletionRequest,
        project_id: str,
        provider_name: str,
        trace_id: str,
        parent_trace_id: Optional[str],
        input_span_id: str,
        start_time: int,
        streaming: bool,
    ) -> TraceModel:
        trace_group_id = request.trace_group_id
        if not trace_group_id and parent_trace_id:
            parent_trace = await self.session.get(TraceModel, parent_trace_id)
            trace_group_id = parent_trace.trace_group_id if parent_trace else parent_trace_id
        if not trace_group_id:
            trace_group_id = trace_id

        tags = [f"model:{request.model}", f"provider:{provider_name}"]
        if streaming:
            tags.append("stream:true")
        trace = TraceModel(
            id=trace_id,
            project_id=project_id,
            parent_trace_id=parent_trace_id,
            trace_group_id=trace_group_id,
            input_span_id=input_span_id,
            output_span_id=input_span_id,
            timestamp=start_time,
            total_latency=0.0,
            total_cost=0.0,
            total_tokens=0,
            status="pending",
            tags=tags,
        )
        self.session.add(trace)
        return trace

    def _build_call_span(
        self,
        request: ChatCompletionRequest,
        provider_name: str,
        trace_id: str,
        span_id: str,
        parent_span_id: Optional[str],
        parent_trace_id: Optional[str],
        start_time: int,
        streaming: bool,
        bypass_cache: bool,
        cache_mode: Optional[str],
        cache_ttl: Optional[int],
    ) -> SpanModel:
        attributes = {
            "model": request.model,
            "provider": provider_name,
            "temperature": request.temperature,
        }
        if not streaming:
            attributes["cache_mode"] = cache_mode or ("never" if bypass_cache else "auto")
            if cache_ttl is not None:
                attributes["cache_ttl"] = cache_ttl
        if parent_trace_id:
            attributes["parent_trace_id"] = parent_trace_id
        return SpanModel(
            id=span_id,
            trace_id=trace_id,
            parent_id=parent_span_id,
            name="LLM Call (stream)" if streaming else "LLM Call",
            type=SpanType.LLM,
            start_time=start_time,
            end_time=start_time,
            status="pending",
            input=request.model_dump(exclude_none=True),
            output={},
            metrics={},
            attributes=attributes,
            tags=[],
        )
