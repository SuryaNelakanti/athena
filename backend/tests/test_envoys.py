"""
Unit tests for Titan Envoys (Provider Adapters).
Uses MockEnvoy for full pipeline testing without real API keys.
"""
import pytest
from app.providers.base import TitanEnvoy
from app.providers.mock_provider import MockEnvoy
from app.providers.factory import get_envoy
from app.schemas.proxy import ChatCompletionRequest, ChatMessage


class TestMockEnvoy:
    @pytest.fixture
    def envoy(self):
        return MockEnvoy()

    @pytest.fixture
    def sample_request(self):
        return ChatCompletionRequest(
            model="mock-model",
            messages=[
                ChatMessage(role="system", content="You are helpful."),
                ChatMessage(role="user", content="Hello, Mock!")
            ]
        )

    @pytest.mark.asyncio
    async def test_chat_completion_returns_response(self, envoy, sample_request):
        response = await envoy.chat_completion(sample_request)
        
        assert response is not None
        assert response.id.startswith("mock-")
        assert response.provider == "mock"
        assert len(response.choices) == 1
        assert "Mock response to: Hello, Mock!" in response.choices[0].message.content

    @pytest.mark.asyncio
    async def test_chat_completion_captures_usage(self, envoy, sample_request):
        response = await envoy.chat_completion(sample_request)
        
        assert response.usage is not None
        assert response.usage.prompt_tokens > 0
        assert response.usage.completion_tokens > 0
        assert response.usage.total_tokens == response.usage.prompt_tokens + response.usage.completion_tokens

    @pytest.mark.asyncio
    async def test_stream_chat_completion_yields_chunks(self, envoy, sample_request):
        chunks = []
        async for chunk in envoy.stream_chat_completion(sample_request):
            chunks.append(chunk)
        
        assert len(chunks) > 0
        # Last chunk should have finish_reason
        assert chunks[-1].choices[0].finish_reason == "stop"
        
        # Concatenate content
        full_content = "".join(c.choices[0].delta.content or "" for c in chunks)
        assert "Mock streaming response to: Hello, Mock!" in full_content

    @pytest.mark.asyncio
    async def test_call_count_increments(self, envoy, sample_request):
        assert envoy.call_count == 0
        await envoy.chat_completion(sample_request)
        assert envoy.call_count == 1
        await envoy.chat_completion(sample_request)
        assert envoy.call_count == 2


class TestEnvoyFactory:
    def test_get_mock_envoy(self):
        envoy = get_envoy("mock")
        assert isinstance(envoy, MockEnvoy)

    def test_get_openai_envoy_type(self):
        # OpenAI constructor warns but doesn't raise without key
        # Just verify it returns the right type
        import os
        if not os.getenv("OPENAI_API_KEY"):
            pytest.skip("OPENAI_API_KEY not set")
        envoy = get_envoy("openai")
        assert isinstance(envoy, TitanEnvoy)
        assert type(envoy).__name__ == "OpenAIEnvoy"

    def test_get_anthropic_envoy_type(self):
        import os
        if not os.getenv("ANTHROPIC_API_KEY"):
            pytest.skip("ANTHROPIC_API_KEY not set")
        envoy = get_envoy("anthropic")
        assert isinstance(envoy, TitanEnvoy)
        assert type(envoy).__name__ == "AnthropicEnvoy"

    def test_get_gemini_envoy_type(self):
        import os
        if not os.getenv("GEMINI_API_KEY"):
            pytest.skip("GEMINI_API_KEY not set")
        envoy = get_envoy("gemini")
        assert isinstance(envoy, TitanEnvoy)
        assert type(envoy).__name__ == "GeminiEnvoy"

    def test_unknown_provider_raises(self):
        with pytest.raises(ValueError, match="Unknown provider"):
            get_envoy("unknown_provider")

    def test_case_insensitive_lookup(self):
        envoy1 = get_envoy("MOCK")
        envoy2 = get_envoy("  mock  ")
        assert isinstance(envoy1, MockEnvoy)
        assert isinstance(envoy2, MockEnvoy)
