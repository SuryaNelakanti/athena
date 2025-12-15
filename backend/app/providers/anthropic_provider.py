import os
from typing import AsyncGenerator, Optional, List
import anthropic
from anthropic import AsyncAnthropic
from app.schemas.proxy import ChatCompletionRequest, ChatCompletionResponse, ChatCompletionChunk, ProviderConfig, ChatCompletionChoice, ChatMessage, Usage, ChatCompletionChunkChoice, ChatCompletionChunkDelta
from app.providers.base import TitanEnvoy
import time

class AnthropicEnvoy(TitanEnvoy):
    def __init__(self, config: Optional[ProviderConfig] = None):
        api_key = config.api_key if config else os.getenv("ANTHROPIC_API_KEY")
        base_url = config.base_url if config and config.base_url else None
        
        if not api_key:
             print("Warning: ANTHROPIC_API_KEY not found.")
        
        self.client = AsyncAnthropic(api_key=api_key, base_url=base_url)

    def _prepare_messages(self, messages: List[ChatMessage]):
        system_prompt = None
        filtered_messages = []
        for m in messages:
            if m.role == "system":
                # Concatenate multiple system messages if present
                if system_prompt:
                    system_prompt += f"\n{m.content}"
                else:
                    system_prompt = m.content
            else:
                filtered_messages.append({"role": m.role, "content": m.content})
        return system_prompt, filtered_messages

    async def chat_completion(self, request: ChatCompletionRequest) -> ChatCompletionResponse:
        system, messages = self._prepare_messages(request.messages)
        
        params = {
            "model": request.model,
            "messages": messages,
            "max_tokens": request.max_tokens or 1024, # Anthropic requires max_tokens
            "temperature": request.temperature,
            "top_p": request.top_p,
            "stream": False,
        }
        if system:
            params["system"] = system
        if request.stop:
             params["stop_sequences"] = [request.stop] if isinstance(request.stop, str) else request.stop

        # Remove None values
        params = {k: v for k, v in params.items() if v is not None}

        start_time = time.time()
        response = await self.client.messages.create(**params)
        latency = (time.time() - start_time) * 1000

        # Map Response
        return ChatCompletionResponse(
            id=response.id,
            model=response.model,
            created=int(time.time()), 
            choices=[
                ChatCompletionChoice(
                    index=0,
                    message=ChatMessage(
                        role=response.role,
                        content=response.content[0].text if response.content else ""
                    ),
                    finish_reason=response.stop_reason
                )
            ],
            usage=Usage(
                prompt_tokens=response.usage.input_tokens,
                completion_tokens=response.usage.output_tokens,
                total_tokens=response.usage.input_tokens + response.usage.output_tokens,
                latency_ms=latency
            ),
            provider="anthropic"
        )

    async def stream_chat_completion(self, request: ChatCompletionRequest) -> AsyncGenerator[ChatCompletionChunk, None]:
        system, messages = self._prepare_messages(request.messages)
        
        params = {
            "model": request.model,
            "messages": messages,
            "max_tokens": request.max_tokens or 1024,
            "temperature": request.temperature,
            "top_p": request.top_p,
            "stream": True,
        }
        if system:
            params["system"] = system
        if request.stop:
             params["stop_sequences"] = [request.stop] if isinstance(request.stop, str) else request.stop
             
        params = {k: v for k, v in params.items() if v is not None}
        
        stream = await self.client.messages.create(**params)
        
        async for event in stream:
            # Anthropic stream events are different: MessageStart, ContentBlockDelta, etc.
            if event.type == 'content_block_delta':
                 yield ChatCompletionChunk(
                    id="stream", # Anthropic doesn't send ID in delta?
                    model=request.model, # Or from event?
                    choices=[
                        ChatCompletionChunkChoice(
                            index=0,
                            delta=ChatCompletionChunkDelta(
                                content=event.delta.text
                            ),
                            finish_reason=None
                        )
                    ]
                 )
            elif event.type == 'message_stop':
                # End of stream
                 yield ChatCompletionChunk(
                    id="stream",
                    model=request.model,
                    choices=[
                        ChatCompletionChunkChoice(
                            index=0,
                            delta=ChatCompletionChunkDelta(),
                            finish_reason="stop" # or event.stop_reason
                        )
                    ]
                 )
    
    async def list_models(self) -> List[str]:
        return [
            "claude-3-5-sonnet-20240620",
            "claude-3-opus-20240229",
            "claude-3-sonnet-20240229",
            "claude-3-haiku-20240307"
        ]
