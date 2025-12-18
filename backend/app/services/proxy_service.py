from typing import AsyncGenerator, Dict, Any, Optional, List
import time
import uuid
import json

from sqlalchemy.ext.asyncio import AsyncSession
from app.schemas.proxy import ChatCompletionRequest, ChatCompletionResponse, ChatCompletionChunk, ProviderConfig, ModelCard
from app.providers.factory import get_envoy
from app.models import TraceModel, SpanModel, SpanType, DatasetRowModel # Trace, Span, Dataset DB models

class ProxyService:
    def __init__(self, session: AsyncSession):
        self.session = session
    
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

    async def chat_completion(self, request: ChatCompletionRequest, project_id: str = "default") -> ChatCompletionResponse:
        provider_name = self._resolve_provider(request)
        envoy = get_envoy(provider_name)
        
        # --- Start Trace ---
        trace_id = request.trace_id or str(uuid.uuid4())
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
            tags=[f"model:{request.model}", f"provider:{provider_name}"]
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
                "temperature": request.temperature
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
             
             self.session.add(span)
             self.session.add(trace)
             await self.session.commit()
             
             return response
             
        except Exception as e:
            end_time = int(time.time() * 1000)
            span.end_time = end_time
            span.status = "error"
            span.error_message = str(e)
            
            trace.status = "error"
            trace.total_latency = end_time - start_time
            
            self.session.add(span)
            self.session.add(trace)
            await self.session.commit()
            
            raise e

    async def stream_chat_completion(self, request: ChatCompletionRequest, project_id: str = "default") -> AsyncGenerator[str, None]:
        # TODO: Full Streaming Trace Logic (Aggregation)
        # For Phase 2 MVP, just pass through.
        
        provider_name = self._resolve_provider(request)
        envoy = get_envoy(provider_name)
        
        stream = envoy.stream_chat_completion(request)
        
        async for chunk in stream:
            yield f"data: {chunk.model_dump_json(exclude_none=True)}\n\n"
        
        yield "data: [DONE]\n\n"

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
                envoy = get_envoy(p)
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
