from typing import Optional
from app.schemas.proxy import ProviderConfig
from app.providers.base import TitanEnvoy
from app.providers.openai_provider import OpenAIEnvoy
from app.providers.anthropic_provider import AnthropicEnvoy
from app.providers.gemini_provider import GeminiEnvoy
from app.providers.mock_provider import MockEnvoy

def get_envoy(provider_name: str, config: Optional[ProviderConfig] = None) -> TitanEnvoy:
    """
    Factory function to return a Titan Envoy instance based on provider name.
    """
    normalized_name = provider_name.lower().strip()
    
    if normalized_name == "openai":
        return OpenAIEnvoy(config)
    elif normalized_name == "anthropic":
        return AnthropicEnvoy(config)
    elif normalized_name == "gemini" or normalized_name == "google":
        return GeminiEnvoy(config)
    elif normalized_name == "mock":
        return MockEnvoy(config)
    else:
        raise ValueError(f"Unknown provider: {provider_name}")
