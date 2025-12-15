import time
import uuid
from typing import AsyncGenerator, Optional, List
from app.schemas.proxy import (
    ChatCompletionRequest, ChatCompletionResponse, ChatCompletionChunk,
    ProviderConfig, ChatCompletionChoice, ChatMessage, Usage,
    ChatCompletionChunkChoice, ChatCompletionChunkDelta
)
from app.providers.base import TitanEnvoy

class MockEnvoy(TitanEnvoy):
    """
    Mock Titan Envoy for testing purposes.
    Returns deterministic responses without hitting real provider APIs.
    """
    def __init__(self, config: Optional[ProviderConfig] = None):
        self.config = config
        self.call_count = 0

    async def chat_completion(self, request: ChatCompletionRequest) -> ChatCompletionResponse:
        self.call_count += 1
        
        # Echo back user's last message with a prefix
        user_message = next((m.content for m in reversed(request.messages) if m.role == "user"), "")
        response_content = f"Mock response to: {user_message}"
        
        return ChatCompletionResponse(
            id=f"mock-{uuid.uuid4().hex[:8]}",
            model=request.model,
            created=int(time.time()),
            choices=[
                ChatCompletionChoice(
                    index=0,
                    message=ChatMessage(role="assistant", content=response_content),
                    finish_reason="stop"
                )
            ],
            usage=Usage(
                prompt_tokens=len(user_message.split()),
                completion_tokens=len(response_content.split()),
                total_tokens=len(user_message.split()) + len(response_content.split()),
                latency_ms=10.0
            ),
            provider="mock"
        )

    async def stream_chat_completion(self, request: ChatCompletionRequest) -> AsyncGenerator[ChatCompletionChunk, None]:
        self.call_count += 1
        
        user_message = next((m.content for m in reversed(request.messages) if m.role == "user"), "")
        response_words = f"Mock streaming response to: {user_message}".split()
        
        for i, word in enumerate(response_words):
            yield ChatCompletionChunk(
                id=f"mock-stream-{uuid.uuid4().hex[:8]}",
                model=request.model,
                choices=[
                    ChatCompletionChunkChoice(
                        index=0,
                        delta=ChatCompletionChunkDelta(content=word + " "),
                        finish_reason=None if i < len(response_words) - 1 else "stop"
                    )
                ]
            )

    async def list_models(self) -> List[str]:
        return ["mock-model-v1", "mock-model-v2-beta"]
