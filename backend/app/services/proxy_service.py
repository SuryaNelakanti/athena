from typing import AsyncGenerator, Dict, Any, Optional, List
import time
import uuid
import json

from sqlalchemy.ext.asyncio import AsyncSession
from app.schemas.proxy import ChatCompletionRequest, ChatCompletionResponse, ChatCompletionChunk, ProviderConfig, ModelCard
from app.providers.factory import get_envoy
from app.models import TraceModel, SpanModel, SpanType, DatasetRowModel, LogModel  # Trace, Span, Dataset, Log DB models
from app.services.provider_keys import ProviderKeyStore
from app.services.cache import get_cache

class ProxyService:
    def __init__(self, session: AsyncSession):
        self.session = session

    def _provider_config(self, provider_name: str) -> ProviderConfig | None:
        api_key = ProviderKeyStore.get_key(provider_name)
        if not api_key:
            return None
        return ProviderConfig(provider_name=provider_name, api_key=api_key)

    async def _allocate_trace_id(self, requested_trace_id: Optional[str]) -> tuple[str, Optional[str]]:
        """
        Returns (trace_id_to_use, parent_trace_id).

        `ChatCompletionRequest.trace_id` is treated as a "parent trace" hint when the ID already exists,
        to avoid primary-key collisions with the current single-root-trace schema.
        """
        if not requested_trace_id:
            return str(uuid.uuid4()), None

        existing = await self.session.get(TraceModel, requested_trace_id)
        if existing:
            return str(uuid.uuid4()), requested_trace_id

        return requested_trace_id, None
    
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

    async def chat_completion(self, request: ChatCompletionRequest, project_id: str = "default", bypass_cache: bool = False) -> ChatCompletionResponse:
        provider_name = self._resolve_provider(request)
        envoy = get_envoy(provider_name, self._provider_config(provider_name))
        
        # --- Start Trace ---
        trace_id, parent_trace_id = await self._allocate_trace_id(request.trace_id)
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
        
        trace = TraceModel(
            id=trace_id,
            project_id=project_id,
            timestamp=start_time,
            total_latency=0.0,
            total_cost=0.0,
            total_tokens=0,
            status="pending",
            tags=[
                f"model:{request.model}",
                f"provider:{provider_name}",
                *([f"parent_trace:{parent_trace_id}"] if parent_trace_id else []),
            ]
        )
        self.session.add(trace)
        
        span = SpanModel(
            id=span_id,
            trace_id=trace_id,
            parent_id=None, # Proxy call is usually root of this interaction, or we need parent_span_id
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
             response = await envoy.chat_completion(request)
             
             # Success
             end_time = int(time.time() * 1000)
             latency = end_time - start_time
             
             span.end_time = end_time
             span.status = "success"
             span.output = response.model_dump(exclude_none=True)
             
             # Metrics
             if response.usage:
                span.metrics = {
                    "prompt_tokens": response.usage.prompt_tokens,
                    "completion_tokens": response.usage.completion_tokens,
                    "total_tokens": response.usage.total_tokens,
                    "latency_ms": latency # use measured latency or provider latency
                }
                # Update Trace Aggregates
                trace.total_tokens = response.usage.total_tokens
                # trace.total_cost = ... (calculate cost)
             
             trace.total_latency = latency
             trace.status = "success"
             
             # Create canonical log row for this proxy call
             log = LogModel(
                 id=f"log_{uuid.uuid4().hex[:16]}",
                 project_id=project_id,
                 trace_id=trace_id,
                 span_id=span_id,
                 level="INFO",
                 message=f"LLM call to {request.model}",
                 timestamp=start_time,
                 latency_ms=latency,
                 prompt_tokens=response.usage.prompt_tokens if response.usage else None,
                 completion_tokens=response.usage.completion_tokens if response.usage else None,
                 total_tokens=response.usage.total_tokens if response.usage else None,
                 cost=None,  # TODO: implement cost calculation
                 model=request.model,
                 provider=provider_name,
                 attributes={},
                 log_metadata={},
                 created_at=end_time,
             )
             self.session.add(log)
             
             self.session.add(span)
             self.session.add(trace)
             await self.session.commit()
             
             return response

             
        except Exception as e:
            end_time = int(time.time() * 1000)
            latency = end_time - start_time
            span.end_time = end_time
            span.status = "error"
            span.error_message = str(e)
            
            trace.status = "error"
            trace.total_latency = latency
            
            # Create error log row
            log = LogModel(
                id=f"log_{uuid.uuid4().hex[:16]}",
                project_id=project_id,
                trace_id=trace_id,
                span_id=span_id,
                level="ERROR",
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
            
            raise e

    async def stream_chat_completion(self, request: ChatCompletionRequest, project_id: str = "default") -> AsyncGenerator[str, None]:
        # Persist a trace/span for streaming runs and aggregate final output.
        provider_name = self._resolve_provider(request)
        envoy = get_envoy(provider_name, self._provider_config(provider_name))

        trace_id, parent_trace_id = await self._allocate_trace_id(request.trace_id)
        span_id = str(uuid.uuid4())
        start_time = int(time.time() * 1000)

        trace = TraceModel(
            id=trace_id,
            project_id=project_id,
            timestamp=start_time,
            total_latency=0.0,
            total_cost=0.0,
            total_tokens=0,
            status="pending",
            tags=[
                f"model:{request.model}",
                f"provider:{provider_name}",
                "stream:true",
                *([f"parent_trace:{parent_trace_id}"] if parent_trace_id else []),
            ],
        )
        self.session.add(trace)

        span = SpanModel(
            id=span_id,
            trace_id=trace_id,
            parent_id=None,
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

            trace.total_latency = latency_ms
            trace.status = "success"

            # Create canonical log row for streaming call
            log = LogModel(
                id=f"log_{uuid.uuid4().hex[:16]}",
                project_id=project_id,
                trace_id=trace_id,
                span_id=span_id,
                level="INFO",
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

            yield "data: [DONE]\n\n"

        except Exception as e:
            end_time = int(time.time() * 1000)
            latency_ms = end_time - start_time
            span.end_time = end_time
            span.status = "error"
            span.error_message = str(e)
            span.metrics = {"latency_ms": latency_ms}

            trace.status = "error"
            trace.total_latency = latency_ms

            # Create error log row for streaming
            log = LogModel(
                id=f"log_{uuid.uuid4().hex[:16]}",
                project_id=project_id,
                trace_id=trace_id,
                span_id=span_id,
                level="ERROR",
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
            raise e

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
        Promotes the root span of a trace to a dataset row.
        """
        from sqlmodel import select
        statement = select(SpanModel).where(
            SpanModel.trace_id == trace_id, 
            SpanModel.parent_id == None
        )
        result = await self.session.execute(statement)
        root_span = result.scalar_one_or_none()
        
        if not root_span:
            raise ValueError(f"Root span not found for trace {trace_id}")
            
        row = DatasetRowModel(
            id=f"dr_{uuid.uuid4().hex[:8]}",
            dataset_id=dataset_id,
            input=root_span.input,
            expected=root_span.output, # Output becomes the 'expected' value
            meta={"source_trace_id": trace_id}
        )
        self.session.add(row)
        await self.session.commit()
        await self.session.refresh(row)
        return row
