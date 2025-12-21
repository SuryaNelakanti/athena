import os
from typing import AsyncGenerator, Optional, List
import openai
from openai import AsyncOpenAI
from app.schemas.proxy import ChatCompletionRequest, ChatCompletionResponse, ChatCompletionChunk, ProviderConfig, ChatCompletionChoice, ChatMessage, Usage, ChatCompletionChunkChoice, ChatCompletionChunkDelta
from app.providers.base import TitanEnvoy
import time

class OpenAIEnvoy(TitanEnvoy):
    def __init__(self, config: Optional[ProviderConfig] = None):
        api_key = config.api_key if config else os.getenv("OPENAI_API_KEY")
        base_url = config.base_url if config and config.base_url else None
        
        if not api_key:
            # For testing purposes allow missing key, but warn/fail on use
             print("Warning: OPENAI_API_KEY not found.")
        
        self.client = AsyncOpenAI(api_key=api_key, base_url=base_url)

    async def chat_completion(self, request: ChatCompletionRequest) -> ChatCompletionResponse:
        messages = [m.model_dump(exclude_none=True) for m in request.messages]
        
        # Mapping Parameters
        params = {
            "model": request.model,
            "messages": messages,
            "temperature": request.temperature,
            "top_p": request.top_p,
            "n": request.n,
            "stream": False,
            "stop": request.stop,
            "max_tokens": request.max_tokens,
            "presence_penalty": request.presence_penalty,
            "frequency_penalty": request.frequency_penalty,
            "logit_bias": request.logit_bias,
            "user": request.user,
        }
        # Filter None
        params = {k: v for k, v in params.items() if v is not None}

        start_time = time.time()
        response = await self.client.chat.completions.create(**params)
        latency = (time.time() - start_time) * 1000

        # Map Response
        choices = []
        reasoning_content = None
        
        for c in response.choices:
            # Extract reasoning content for o1/o3 models if present
            # OpenAI returns this as a separate field on the message for reasoning models
            if hasattr(c.message, 'reasoning_content') and c.message.reasoning_content:
                reasoning_content = c.message.reasoning_content
            
            choices.append(ChatCompletionChoice(
                index=c.index,
                message=ChatMessage(
                    role=c.message.role,
                    content=c.message.content or "",
                    name=None
                ),
                finish_reason=c.finish_reason
            ))
            
        return ChatCompletionResponse(
            id=response.id,
            model=response.model,
            created=response.created,
            choices=choices,
            usage=Usage(
                prompt_tokens=response.usage.prompt_tokens,
                completion_tokens=response.usage.completion_tokens,
                total_tokens=response.usage.total_tokens,
                latency_ms=latency
            ),
            system_fingerprint=response.system_fingerprint,
            provider="openai",
            athena_reasoning=reasoning_content  # Pass through reasoning for o1/o3 models
        )

    async def stream_chat_completion(self, request: ChatCompletionRequest) -> AsyncGenerator[ChatCompletionChunk, None]:
        messages = [m.model_dump(exclude_none=True) for m in request.messages]
        
        params = {
            "model": request.model,
            "messages": messages,
            "temperature": request.temperature,
            "top_p": request.top_p,
            "n": request.n,
            "stream": True,
            "stop": request.stop,
            "max_tokens": request.max_tokens,
            "presence_penalty": request.presence_penalty,
            "frequency_penalty": request.frequency_penalty,
            "logit_bias": request.logit_bias,
            "user": request.user,
        }
        params = {k: v for k, v in params.items() if v is not None}
        
        stream = await self.client.chat.completions.create(**params)
        
        async for chunk in stream:
            choices = []
            for c in chunk.choices:
                # Extract reasoning_content delta for o1/o3 models if present
                reasoning_delta = None
                if hasattr(c.delta, 'reasoning_content'):
                    reasoning_delta = c.delta.reasoning_content
                
                delta = ChatCompletionChunkDelta(
                    role=c.delta.role,
                    content=c.delta.content,
                    reasoning_content=reasoning_delta  # Pass through reasoning delta
                )
                choices.append(ChatCompletionChunkChoice(
                    index=c.index,
                    delta=delta,
                    finish_reason=c.finish_reason
                ))
            
            yield ChatCompletionChunk(
                id=chunk.id,
                model=chunk.model,
                created=chunk.created,
                choices=choices,
            )
    
    async def list_models(self) -> List[str]:
        try:
            models_page = await self.client.models.list()
            return [m.id for m in models_page.data]
        except Exception as e:
            print(f"Error fetching OpenAI models: {e}")
            return []
