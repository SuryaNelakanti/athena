from abc import ABC, abstractmethod
from typing import AsyncGenerator, Dict, Any, List
from app.schemas.proxy import ChatCompletionRequest, ChatCompletionResponse, ChatCompletionChunk

class TitanEnvoy(ABC):
    """
    Abstract Base Class for AI Provider Envoys (Titan Envoys).
    Enforces a standard interface for all providers (OpenAI, Anthropic, Gemini).
    """
    
    @abstractmethod
    async def chat_completion(self, request: ChatCompletionRequest) -> ChatCompletionResponse:
        """
        Execute a unified chat completion request and return a unified response.
        """
        pass

    @abstractmethod
    async def stream_chat_completion(self, request: ChatCompletionRequest) -> AsyncGenerator[ChatCompletionChunk, None]:
        """
        Execute a unified chat completion request and yield unified chunks (SSE ready).
        """
        pass

    @abstractmethod
    async def list_models(self) -> List[str]:
        """
        Return a list of model IDs available from this provider.
        """
        pass
