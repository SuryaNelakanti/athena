"""
Groq Envoy - Provider adapter for Groq API.

Groq provides an OpenAI-compatible API at https://api.groq.com/openai/v1/
This implementation reuses the OpenAI SDK with Groq's base URL.

Supported models include:
- llama-3.3-70b-versatile, llama-3.1-8b-instant
- openai/gpt-oss-120b, openai/gpt-oss-20b
- whisper-large-v3, whisper-large-v3-turbo
- groq/compound, groq/compound-mini
- qwen/qwen3-32b, meta-llama/* variants
"""
import logging
import os
from typing import AsyncGenerator, Optional, List
from openai import AsyncOpenAI
from app.schemas.proxy import (
    ChatCompletionRequest,
    ChatCompletionResponse,
    ChatCompletionChunk,
    ProviderConfig,
    ChatCompletionChoice,
    ChatMessage,
    Usage,
    ChatCompletionChunkChoice,
    ChatCompletionChunkDelta,
)
from app.providers.base import TitanEnvoy
import time

logger = logging.getLogger(__name__)


class GroqEnvoy(TitanEnvoy):
    """
    Titan Envoy implementation for Groq.
    Uses OpenAI SDK with Groq's OpenAI-compatible base URL.
    """

    GROQ_BASE_URL = "https://api.groq.com/openai/v1"

    def __init__(self, config: Optional[ProviderConfig] = None):
        api_key = config.api_key if config else os.getenv("GROQ_API_KEY")

        if not api_key:
            logger.warning("GROQ_API_KEY not found; Groq requests may fail until configured")

        self.client = AsyncOpenAI(
            api_key=api_key,
            base_url=self.GROQ_BASE_URL,
        )

    async def chat_completion(self, request: ChatCompletionRequest) -> ChatCompletionResponse:
        messages = [m.model_dump(exclude_none=True) for m in request.messages]

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
            "user": request.user,
        }
        # Filter None values - Groq doesn't support all OpenAI params
        params = {k: v for k, v in params.items() if v is not None}

        # Remove unsupported parameters for Groq
        # Groq doesn't support logit_bias

        start_time = time.time()
        response = await self.client.chat.completions.create(**params)
        latency = (time.time() - start_time) * 1000

        choices = []
        for c in response.choices:
            choices.append(
                ChatCompletionChoice(
                    index=c.index,
                    message=ChatMessage(
                        role=c.message.role,
                        content=c.message.content or "",
                        name=None,
                    ),
                    finish_reason=c.finish_reason,
                )
            )

        return ChatCompletionResponse(
            id=response.id,
            model=response.model,
            created=response.created,
            choices=choices,
            usage=Usage(
                prompt_tokens=response.usage.prompt_tokens,
                completion_tokens=response.usage.completion_tokens,
                total_tokens=response.usage.total_tokens,
                latency_ms=latency,
            ),
            system_fingerprint=getattr(response, "system_fingerprint", None),
            provider="groq",
        )

    async def stream_chat_completion(
        self, request: ChatCompletionRequest
    ) -> AsyncGenerator[ChatCompletionChunk, None]:
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
            "user": request.user,
        }
        params = {k: v for k, v in params.items() if v is not None}

        stream = await self.client.chat.completions.create(**params)

        async for chunk in stream:
            choices = []
            for c in chunk.choices:
                delta = ChatCompletionChunkDelta(
                    role=c.delta.role,
                    content=c.delta.content,
                )
                choices.append(
                    ChatCompletionChunkChoice(
                        index=c.index,
                        delta=delta,
                        finish_reason=c.finish_reason,
                    )
                )

            yield ChatCompletionChunk(
                id=chunk.id,
                model=chunk.model,
                created=chunk.created,
                choices=choices,
            )

    async def list_models(self) -> List[str]:
        """
        Return available Groq models by querying the API.
        """
        try:
            models_page = await self.client.models.list()
            return [m.id for m in models_page.data]
        except Exception:
            logger.exception("Failed to fetch Groq models")
            # Return known production models as fallback
            return [
                "llama-3.3-70b-versatile",
                "llama-3.1-8b-instant",
                "openai/gpt-oss-120b",
                "openai/gpt-oss-20b",
                "whisper-large-v3",
                "whisper-large-v3-turbo",
                "groq/compound",
                "groq/compound-mini",
            ]
