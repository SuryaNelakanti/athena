from collections.abc import Callable

from app.providers.anthropic_provider import AnthropicEnvoy
from app.providers.base import TitanEnvoy
from app.providers.gemini_provider import GeminiEnvoy
from app.providers.groq_provider import GroqEnvoy
from app.providers.mock_provider import MockEnvoy
from app.providers.openai_provider import OpenAIEnvoy
from app.schemas.proxy import ProviderConfig


class ProviderSelectionError(ValueError):
    """Base class for provider selection failures that map to client errors."""


class UnsupportedProviderError(ProviderSelectionError):
    """Raised when a requested provider name is not registered."""


class ProviderResolutionError(ProviderSelectionError):
    """Raised when a model name does not identify a supported provider."""


ProviderFactory = Callable[[ProviderConfig | None], TitanEnvoy]

_PROVIDER_FACTORIES: dict[str, ProviderFactory] = {
    "openai": OpenAIEnvoy,
    "anthropic": AnthropicEnvoy,
    "gemini": GeminiEnvoy,
    "groq": GroqEnvoy,
    "mock": MockEnvoy,
}
_PROVIDER_ALIASES = {"google": "gemini"}


def normalize_provider_name(provider_name: str) -> str:
    normalized_name = provider_name.strip().lower()
    canonical_name = _PROVIDER_ALIASES.get(normalized_name, normalized_name)
    if canonical_name not in _PROVIDER_FACTORIES:
        raise UnsupportedProviderError(f"Unknown provider: {provider_name}")
    return canonical_name


def resolve_provider_for_model(model_name: str) -> str:
    normalized_model = model_name.strip().lower()
    if "gpt" in normalized_model:
        return "openai"
    if "claude" in normalized_model:
        return "anthropic"
    if "gemini" in normalized_model:
        return "gemini"
    if normalized_model.startswith("groq/"):
        return "groq"
    raise ProviderResolutionError(
        f"Could not resolve provider for model: {model_name}"
    )


def get_envoy(provider_name: str, config: ProviderConfig | None = None) -> TitanEnvoy:
    canonical_name = normalize_provider_name(provider_name)
    provider_factory = _PROVIDER_FACTORIES[canonical_name]
    return provider_factory(config)
