from typing import AsyncGenerator, Dict, Any, Optional, List
import time
import uuid
import json
import os

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select
from app.schemas.proxy import ChatCompletionRequest, ChatCompletionResponse, ChatCompletionChunk, ProviderConfig, ModelCard
from app.providers.factory import get_envoy
from app.models import TraceModel, SpanModel, SpanType, DatasetRowModel, LogModel  # Trace, Span, Dataset, Log DB models
from app.services.trace_service import extract_trace_io
from app.services.provider_keys import ProviderKeyStore
from app.services.job_service import JobService
from app.services.cache import get_cache

class ProxyService:
    def __init__(self, session: AsyncSession):
        self.session = session

    def _provider_config(self, provider_name: str) -> ProviderConfig | None:
        api_key = ProviderKeyStore.get_key(provider_name)
        if not api_key:
            return None
        return ProviderConfig(provider_name=provider_name, api_key=api_key)

    async def _resolve_trace_context(
        self,
        requested_trace_id: Optional[str],
        requested_parent_span_id: Optional[str],
    ) -> tuple[str, Optional[str], Optional[str], Optional[TraceModel]]:
        """
        Returns (trace_id_to_use, parent_trace_id, parent_span_id, existing_trace).

        If a trace exists and a valid parent span is provided, attach to the existing
        trace so the new span nests correctly. Otherwise a new trace will be created
        with parent_trace_id set to the requested trace.
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
    
    def _resolve_provider(self, request: ChatCompletionRequest) -> str:
        if request.provider:
            return request.provider

        model = request.model.lower()
        if "gpt" in model:
            return "openai"
        if "claude" in model:
            return "anthropic"
        if "gemini" in model:
            return "gemini"

        # Fallback or error
        raise ValueError(f"Could not resolve provider for model: {request.model}")

    def _normalize_messages(self, messages: list) -> list:
        normalized = []
        for msg in messages:
            if hasattr(msg, "model_dump"):
                normalized.append(msg.model_dump(exclude_none=True))
            else:
                normalized.append(msg)
        return normalized

    def _env_float(self, key: str) -> Optional[float]:
        raw = os.getenv(key)
        if raw is None:
            return None
        raw = raw.strip()
        if not raw:
            return None
        try:
            return float(raw)
        except ValueError:
            return None

    def _estimate_cost(self, usage: Optional["Usage"]) -> Optional[float]:
        if not usage:
            return None
        if usage.cost is not None:
            return usage.cost

        prompt_rate = self._env_float("ATHENA_COST_PROMPT_PER_1K")
        completion_rate = self._env_float("ATHENA_COST_COMPLETION_PER_1K")
        total_rate = self._env_float("ATHENA_COST_TOTAL_PER_1K")

        prompt_tokens = usage.prompt_tokens or 0
        completion_tokens = usage.completion_tokens or 0
        total_tokens = usage.total_tokens or (prompt_tokens + completion_tokens)

        if prompt_rate is not None or completion_rate is not None:
            cost = 0.0
            if prompt_rate is not None:
                cost += (prompt_tokens / 1000.0) * prompt_rate
            if completion_rate is not None:
                cost += (completion_tokens / 1000.0) * completion_rate
            return cost

        if total_rate is not None:
            return (total_tokens / 1000.0) * total_rate

        return None

    async def _update_trace_aggregates(self, trace_id: str) -> None:
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
        total_latency = 0.0
        if start_times and end_times:
            total_latency = max(end_times) - min(start_times)

        trace = await self.session.get(TraceModel, trace_id)
        if trace:
            trace.total_tokens = int(total_tokens)
            trace.total_cost = float(total_cost)
            trace.total_latency = float(total_latency)
            self.session.add(trace)

    async def chat_completion(
        self,
        request: ChatCompletionRequest,
        project_id: str = "default",
        bypass_cache: bool = False,
        parent_span_id: Optional[str] = None,
        cache_encryption_key: Optional[str] = None,
    ) -> ChatCompletionResponse:
        provider_name = self._resolve_provider(request)
        envoy = get_envoy(provider_name, self._provider_config(provider_name))
        cache = get_cache()
        
        # --- Start Trace ---
        trace_id, parent_trace_id, resolved_parent_span_id, existing_trace = await self._resolve_trace_context(
            request.trace_id,
            parent_span_id,
        )
        span_id = str(uuid.uuid4())
        start_time = int(time.time() * 1000)
        
        # If no trace exists yet (root request), create it? 
        # For simplicity, we assume every Proxy call starts a new Trace unless trace_id is passed,
        # but if trace_id IS passed, we assume the Trace parent exists? 
        # Actually, if trace_id is passed, it means we are a child of that trace.
        # But we also need detailed logs.
        # Let's create a TraceModel for THIS request.
        
        # NOTE: In distributed tracing, usually you check if trace exists. 
        # Here we just blindly insert a Trace Record? 
        # Or maybe we assume the Proxy is the entry point.
        
        trace = existing_trace
        if not trace:
            trace_group_id = request.trace_group_id
            if not trace_group_id and parent_trace_id:
                parent_trace = await self.session.get(TraceModel, parent_trace_id)
                trace_group_id = parent_trace.trace_group_id if parent_trace else parent_trace_id
            if not trace_group_id:
                trace_group_id = trace_id
            trace = TraceModel(
                id=trace_id,
                project_id=project_id,
                parent_trace_id=parent_trace_id,
                trace_group_id=trace_group_id,
                input_span_id=span_id,
                output_span_id=span_id,
                timestamp=start_time,
                total_latency=0.0,
                total_cost=0.0,
                total_tokens=0,
                status="pending",
                tags=[
                    f"model:{request.model}",
                    f"provider:{provider_name}",
                ]
            )
            self.session.add(trace)
        
        span = SpanModel(
            id=span_id,
            trace_id=trace_id,
            parent_id=resolved_parent_span_id,
            name="LLM Call",
            type=SpanType.LLM,
            start_time=start_time,
            end_time=start_time, # updated later
            status="pending",
            input=request.model_dump(exclude_none=True),
            output={},
            metrics={},
            attributes={
                "model": request.model,
                "provider": provider_name,
                "temperature": request.temperature,
                **({"parent_trace_id": parent_trace_id} if parent_trace_id else {}),
            },
            tags=[]
        )
        self.session.add(span)
        # Checkpoint (optional, maybe skip commit to save IO, commit at end)

        try:
             normalized_messages = self._normalize_messages(request.messages)
             cache_kwargs = {
                 "provider": provider_name,
                 "temperature": request.temperature,
                 "max_tokens": request.max_tokens,
                 "top_p": request.top_p,
                 "presence_penalty": request.presence_penalty,
                 "frequency_penalty": request.frequency_penalty,
                 "stop": request.stop,
                 "n": request.n,
                 "logit_bias": request.logit_bias,
                 "user": request.user,
                 "stream": False,
             }
             cache_key_bytes = None
             if not bypass_cache and cache_encryption_key is not None:
                 cache_key_bytes = cache.normalize_encryption_key(cache_encryption_key)
             cached_payload = None
             if not bypass_cache:
                 cached_payload = await cache.get(
                     model=request.model,
                     messages=normalized_messages,
                     encryption_key=cache_key_bytes,
                     **cache_kwargs,
                 )
             if cached_payload is not None:
                 response = ChatCompletionResponse.model_validate(cached_payload)
                 end_time = int(time.time() * 1000)
                 latency = end_time - start_time

                 span.end_time = end_time
                 span.status = "success"
                 span.output = response.model_dump(exclude_none=True)
                 attributes = {
                     **(span.attributes or {}),
                     "cache_hit": True,
                     "cache_encrypted": bool(cache_key_bytes),
                 }
                 if response.athena_reasoning:
                     attributes.update({
                         "reasoning_content": response.athena_reasoning,
                         "reasoning_enabled": True,
                     })
                 span.attributes = attributes

                 cost = self._estimate_cost(response.usage)
                 if response.usage and cost is not None:
                     response.usage.cost = cost

                 if response.usage:
                     span.metrics = {
                         "prompt_tokens": response.usage.prompt_tokens,
                         "completion_tokens": response.usage.completion_tokens,
                         "total_tokens": response.usage.total_tokens,
                         "latency_ms": latency,
                         **({"cost": cost} if cost is not None else {}),
                     }
                     if not existing_trace:
                         trace.total_tokens = response.usage.total_tokens
                         if cost is not None:
                             trace.total_cost = cost

                 if not existing_trace:
                     trace.total_latency = latency
                     trace.status = "success"

                 log = LogModel(
                     id=f"log_{uuid.uuid4().hex[:16]}",
                     project_id=project_id,
                     trace_id=trace_id,
                     span_id=span_id,
                     level="INFO",
                     event_type="llm_call",
                     status="success",
                     message=f"LLM call to {request.model} (cache)",
                     timestamp=start_time,
                     latency_ms=latency,
                     prompt_tokens=response.usage.prompt_tokens if response.usage else None,
                     completion_tokens=response.usage.completion_tokens if response.usage else None,
                     total_tokens=response.usage.total_tokens if response.usage else None,
                     cost=cost,
                     model=request.model,
                     provider=provider_name,
                     attributes={
                         "cache_hit": True,
                         "cache_encrypted": bool(cache_key_bytes),
                         "has_reasoning": bool(response.athena_reasoning),
                     },
                     log_metadata={},
                     created_at=end_time,
                 )
                 self.session.add(log)

                 self.session.add(span)
                 self.session.add(trace)
                 await self.session.commit()
                 if existing_trace:
                     await self._update_trace_aggregates(trace_id)
                     await self.session.commit()

                 try:
                     job_service = JobService(self.session)
                     await job_service.create_job(kind="log_score", ref_id=log.id, payload={"source": "proxy"})
                 except Exception:
                     pass

                 response.trace_id = trace_id
                 response.span_id = span_id
                 return response

             response = await envoy.chat_completion(request)
             
             # Success
             end_time = int(time.time() * 1000)
             latency = end_time - start_time
             
             span.end_time = end_time
             span.status = "success"
             span.output = response.model_dump(exclude_none=True)
             
             # Store reasoning content separately in attributes for UI rendering
             if response.athena_reasoning:
                 span.attributes = {
                     **span.attributes,
                     "reasoning_content": response.athena_reasoning,
                     "reasoning_enabled": True,
                 }

             cost = self._estimate_cost(response.usage)
             if response.usage and cost is not None:
                 response.usage.cost = cost

             # Metrics
             if response.usage:
                span.metrics = {
                    "prompt_tokens": response.usage.prompt_tokens,
                    "completion_tokens": response.usage.completion_tokens,
                    "total_tokens": response.usage.total_tokens,
                    "latency_ms": latency,
                    **({"cost": cost} if cost is not None else {}),
                }
                # Update Trace Aggregates (only when creating the trace here)
                if not existing_trace:
                    trace.total_tokens = response.usage.total_tokens
                    if cost is not None:
                        trace.total_cost = cost

             if not existing_trace:
                 trace.total_latency = latency
                 trace.status = "success"
             
             # Create canonical log row for this proxy call
             log = LogModel(
                 id=f"log_{uuid.uuid4().hex[:16]}",
                 project_id=project_id,
                 trace_id=trace_id,
                 span_id=span_id,
                 level="INFO",
                 event_type="llm_call",
                 status="success",
                 message=f"LLM call to {request.model}",
                 timestamp=start_time,
                 latency_ms=latency,
                 prompt_tokens=response.usage.prompt_tokens if response.usage else None,
                 completion_tokens=response.usage.completion_tokens if response.usage else None,
                 total_tokens=response.usage.total_tokens if response.usage else None,
                 cost=cost,
                 model=request.model,
                 provider=provider_name,
                 attributes={"has_reasoning": bool(response.athena_reasoning)},
                 log_metadata={},
                 created_at=end_time,
             )
             self.session.add(log)
             
             self.session.add(span)
             self.session.add(trace)
             await self.session.commit()
             if existing_trace:
                 await self._update_trace_aggregates(trace_id)
                 await self.session.commit()

             try:
                 job_service = JobService(self.session)
                 await job_service.create_job(kind="log_score", ref_id=log.id, payload={"source": "proxy"})
             except Exception:
                 pass
             
                 if not bypass_cache:
                     cached_payload = response.model_dump(exclude_none=True)
                     cached_payload.pop("trace_id", None)
                     cached_payload.pop("span_id", None)
                     await cache.set(
                         model=request.model,
                         messages=normalized_messages,
                         response=cached_payload,
                         encryption_key=cache_key_bytes,
                         **cache_kwargs,
                     )

             # Return response with trace context for client correlation
             response.trace_id = trace_id
             response.span_id = span_id
             return response

             
        except Exception as e:
            end_time = int(time.time() * 1000)
            latency = end_time - start_time
            span.end_time = end_time
            span.status = "error"
            span.error_message = str(e)
            
            if not existing_trace:
                trace.status = "error"
                trace.total_latency = latency
            
            # Create error log row
            log = LogModel(
                id=f"log_{uuid.uuid4().hex[:16]}",
                project_id=project_id,
                trace_id=trace_id,
                span_id=span_id,
                level="ERROR",
                event_type="llm_call",
                status="error",
                message=f"LLM call to {request.model} failed: {str(e)}",
                timestamp=start_time,
                latency_ms=latency,
                model=request.model,
                provider=provider_name,
                attributes={"error": str(e)},
                log_metadata={},
                created_at=end_time,
            )
            self.session.add(log)
            
            self.session.add(span)
            self.session.add(trace)
            await self.session.commit()
            if existing_trace:
                await self._update_trace_aggregates(trace_id)
                await self.session.commit()

            raise e

    async def stream_chat_completion(
        self,
        request: ChatCompletionRequest,
        project_id: str = "default",
        parent_span_id: Optional[str] = None,
    ) -> tuple[AsyncGenerator[str, None], str, str]:
        # Persist a trace/span for streaming runs and aggregate final output.
        provider_name = self._resolve_provider(request)
        envoy = get_envoy(provider_name, self._provider_config(provider_name))

        trace_id, parent_trace_id, resolved_parent_span_id, existing_trace = await self._resolve_trace_context(
            request.trace_id,
            parent_span_id,
        )
        span_id = str(uuid.uuid4())
        start_time = int(time.time() * 1000)

        trace = existing_trace
        if not trace:
            trace_group_id = request.trace_group_id
            if not trace_group_id and parent_trace_id:
                parent_trace = await self.session.get(TraceModel, parent_trace_id)
                trace_group_id = parent_trace.trace_group_id if parent_trace else parent_trace_id
            if not trace_group_id:
                trace_group_id = trace_id
            trace = TraceModel(
                id=trace_id,
                project_id=project_id,
                parent_trace_id=parent_trace_id,
                trace_group_id=trace_group_id,
                input_span_id=span_id,
                output_span_id=span_id,
                timestamp=start_time,
                total_latency=0.0,
                total_cost=0.0,
                total_tokens=0,
                status="pending",
                tags=[
                    f"model:{request.model}",
                    f"provider:{provider_name}",
                    "stream:true",
                ],
            )
            self.session.add(trace)

        span = SpanModel(
            id=span_id,
            trace_id=trace_id,
            parent_id=resolved_parent_span_id,
            name="LLM Call (stream)",
            type=SpanType.LLM,
            start_time=start_time,
            end_time=start_time,
            status="pending",
            input=request.model_dump(exclude_none=True),
            output={},
            metrics={},
            attributes={
                "model": request.model,
                "provider": provider_name,
                "temperature": request.temperature,
                **({"parent_trace_id": parent_trace_id} if parent_trace_id else {}),
            },
            tags=[],
        )
        self.session.add(span)
        await self.session.commit()

        async def event_stream() -> AsyncGenerator[str, None]:
            aggregated_content = ""
            aggregated_reasoning = ""
            stream_response_id: Optional[str] = None

            try:
                async for chunk in envoy.stream_chat_completion(request):
                    if not stream_response_id:
                        stream_response_id = chunk.id

                    if chunk.choices:
                        for choice in chunk.choices:
                            if choice.delta and choice.delta.content:
                                aggregated_content += choice.delta.content
                            if choice.delta and choice.delta.reasoning_content:
                                aggregated_reasoning += choice.delta.reasoning_content

                    chunk.trace_id = trace_id
                    chunk.span_id = span_id
                    yield f"data: {chunk.model_dump_json(exclude_none=True)}\n\n"

                end_time = int(time.time() * 1000)
                latency_ms = end_time - start_time

                span.end_time = end_time
                span.status = "success"
                span.metrics = {"latency_ms": latency_ms}

                # Store an aggregated "final" output snapshot for UI/debugging.
                span.output = {
                    "id": stream_response_id or f"stream-{trace_id}",
                    "object": "chat.completion",
                    "created": int(time.time()),
                    "model": request.model,
                    "choices": [
                        {
                            "index": 0,
                            "message": {"role": "assistant", "content": aggregated_content},
                            "finish_reason": "stop",
                        }
                    ],
                    "usage": None,
                    "provider": provider_name,
                    **({"athena_reasoning": aggregated_reasoning} if aggregated_reasoning else {}),
                }

                if aggregated_reasoning:
                    span.attributes = {**(span.attributes or {}), "reasoning_enabled": True}

                if not existing_trace:
                    trace.total_latency = latency_ms
                    trace.status = "success"

                # Create canonical log row for streaming call
                log = LogModel(
                    id=f"log_{uuid.uuid4().hex[:16]}",
                    project_id=project_id,
                    trace_id=trace_id,
                    span_id=span_id,
                    level="INFO",
                    event_type="llm_stream",
                    status="success",
                    message=f"LLM stream call to {request.model}",
                    timestamp=start_time,
                    latency_ms=latency_ms,
                    model=request.model,
                    provider=provider_name,
                    attributes={"streaming": True},
                    log_metadata={},
                    created_at=end_time,
                )
                self.session.add(log)

                self.session.add(span)
                self.session.add(trace)
                await self.session.commit()
                if existing_trace:
                    await self._update_trace_aggregates(trace_id)
                    await self.session.commit()

                try:
                    job_service = JobService(self.session)
                    await job_service.create_job(kind="log_score", ref_id=log.id, payload={"source": "proxy"})
                except Exception:
                    pass

                yield "data: [DONE]\n\n"

            except Exception as e:
                end_time = int(time.time() * 1000)
                latency_ms = end_time - start_time
                span.end_time = end_time
                span.status = "error"
                span.error_message = str(e)
                span.metrics = {"latency_ms": latency_ms}

                if not existing_trace:
                    trace.status = "error"
                    trace.total_latency = latency_ms

                # Create error log row for streaming
                log = LogModel(
                    id=f"log_{uuid.uuid4().hex[:16]}",
                    project_id=project_id,
                    trace_id=trace_id,
                    span_id=span_id,
                    level="ERROR",
                    event_type="llm_stream",
                    status="error",
                    message=f"LLM stream call to {request.model} failed: {str(e)}",
                    timestamp=start_time,
                    latency_ms=latency_ms,
                    model=request.model,
                    provider=provider_name,
                    attributes={"streaming": True, "error": str(e)},
                    log_metadata={},
                    created_at=end_time,
                )
                self.session.add(log)

                self.session.add(span)
                self.session.add(trace)
                await self.session.commit()
                if existing_trace:
                    await self._update_trace_aggregates(trace_id)
                    await self.session.commit()
                raise e

        return event_stream(), trace_id, span_id

    async def list_models(self) -> List[ModelCard]:
        """
        Aggregates models from all supported providers.
        """
        providers = ["openai", "anthropic", "gemini"]
        all_models = []
        
        # Add Mock for testing
        providers.append("mock")
        
        from app.schemas.proxy import ModelCard
        
        for p in providers:
            try:
                envoy = get_envoy(p, self._provider_config(p))
                model_ids = await envoy.list_models()
                for mid in model_ids:
                    all_models.append(ModelCard(
                        id=mid,
                        owned_by=p
                    ))
            except Exception as e:
                # Log error but don't fail the whole request
                print(f"Failed to list models for {p}: {e}")
                
        return all_models

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
