from dataclasses import dataclass
from typing import Optional

from app.schemas.proxy import ChatCompletionRequest, ChatCompletionResponse
from app.services.cache import CacheService, get_cache


@dataclass(frozen=True)
class ProxyCacheRequest:
    model: str
    messages: list[dict[str, object]]
    options: dict[str, object]
    encryption_key: Optional[bytes]


@dataclass(frozen=True)
class CachedCompletion:
    response: ChatCompletionResponse
    encrypted: bool


class ProxyResponseCache:
    """Prepare, read, and write cached proxy completions."""

    def __init__(self, cache: Optional[CacheService] = None):
        self.cache = cache or get_cache()

    def prepare_request(
        self,
        request: ChatCompletionRequest,
        provider_name: str,
        encryption_key: Optional[str],
    ) -> ProxyCacheRequest:
        return ProxyCacheRequest(
            model=request.model,
            messages=[
                message.model_dump(exclude_none=True) for message in request.messages
            ],
            options={
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
            },
            encryption_key=self.cache.normalize_encryption_key(encryption_key),
        )

    async def get(self, cache_request: ProxyCacheRequest) -> Optional[CachedCompletion]:
        payload = await self.cache.get(
            model=cache_request.model,
            messages=cache_request.messages,
            encryption_key=cache_request.encryption_key,
            **cache_request.options,
        )
        if payload is None:
            return None
        return CachedCompletion(
            response=ChatCompletionResponse.model_validate(payload),
            encrypted=bool(cache_request.encryption_key),
        )

    async def set(
        self,
        cache_request: ProxyCacheRequest,
        response: ChatCompletionResponse,
        ttl: Optional[int] = None,
    ) -> None:
        payload = response.model_dump(exclude_none=True)
        payload.pop("trace_id", None)
        payload.pop("span_id", None)
        payload.pop("log_id", None)
        await self.cache.set(
            model=cache_request.model,
            messages=cache_request.messages,
            response=payload,
            ttl=ttl,
            encryption_key=cache_request.encryption_key,
            **cache_request.options,
        )
