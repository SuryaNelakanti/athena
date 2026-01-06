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

        # Extract content and thinking (Claude's extended thinking feature)
        content_text = ""
        thinking_text = None
        
        for block in response.content:
            if hasattr(block, 'type'):
                if block.type == 'text':
                    content_text = block.text
                elif block.type == 'thinking':
                    # Claude's extended thinking returns a 'thinking' content block
                    thinking_text = block.thinking if hasattr(block, 'thinking') else str(block)
            elif hasattr(block, 'text'):
                content_text = block.text

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
                        content=content_text
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
            provider="anthropic",
            athena_reasoning=thinking_text  # Pass through extended thinking
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
            # Anthropic stream events: MessageStart, ContentBlockDelta, ContentBlockStart, etc.
            if event.type == 'content_block_delta':
                # Check if this is a thinking delta or text delta
                reasoning_delta = None
                content_delta = None
                
                if hasattr(event.delta, 'type'):
                    if event.delta.type == 'thinking_delta':
                        reasoning_delta = event.delta.thinking
                    elif event.delta.type == 'text_delta':
                        content_delta = event.delta.text
                    else:
                        content_delta = getattr(event.delta, 'text', None)
                else:
                    content_delta = getattr(event.delta, 'text', None)
                
                yield ChatCompletionChunk(
                    id="stream",
                    model=request.model,
                    choices=[
                        ChatCompletionChunkChoice(
                            index=0,
                            delta=ChatCompletionChunkDelta(
                                content=content_delta,
                                reasoning_content=reasoning_delta
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
                            finish_reason="stop"
                        )
                    ]
                )
    
    async def list_models(self) -> List[str]:
        try:
            # Anthropic SDK has models.list() in newer versions
            models_page = await self.client.models.list()
            return [m.id for m in models_page.data]
        except Exception as e:
            print(f"Error fetching Anthropic models: {e}")
            # Fallback to known models if API fails
            return [
                "claude-sonnet-4-20250514",
                "claude-3-5-sonnet-20241022",
                "claude-3-5-haiku-20241022",
                "claude-3-opus-20240229",
                "claude-3-sonnet-20240229",
                "claude-3-haiku-20240307"
            ]

