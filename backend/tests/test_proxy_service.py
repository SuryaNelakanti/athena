"""
Unit tests for ProxyService.
Tests provider resolution, tracing, and error handling.
Uses mocking to avoid real DB and API calls.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.services.proxy_service import ProxyService
from app.schemas.proxy import ChatCompletionRequest, ChatMessage, ChatCompletionResponse, Usage, ChatCompletionChoice


class TestProxyServiceProviderResolution:
    @pytest.fixture
    def mock_session(self):
        session = AsyncMock()
        session.add = MagicMock()
        session.commit = AsyncMock()
        return session

    @pytest.fixture
    def service(self, mock_session):
        return ProxyService(mock_session)

    def test_resolve_openai_from_gpt_model(self, service):
        request = ChatCompletionRequest(
            model="gpt-4",
            messages=[ChatMessage(role="user", content="Hi")]
        )
        assert service._resolve_provider(request) == "openai"

    def test_resolve_anthropic_from_claude_model(self, service):
        request = ChatCompletionRequest(
            model="claude-3-opus-20240229",
            messages=[ChatMessage(role="user", content="Hi")]
        )
        assert service._resolve_provider(request) == "anthropic"

    def test_resolve_gemini_from_gemini_model(self, service):
        request = ChatCompletionRequest(
            model="gemini-pro",
            messages=[ChatMessage(role="user", content="Hi")]
        )
        assert service._resolve_provider(request) == "gemini"

    def test_explicit_provider_override(self, service):
        request = ChatCompletionRequest(
            model="some-custom-model",
            messages=[ChatMessage(role="user", content="Hi")],
            provider="openai"
        )
        assert service._resolve_provider(request) == "openai"

    def test_unknown_model_raises(self, service):
        request = ChatCompletionRequest(
            model="unknown-xyz-model",
            messages=[ChatMessage(role="user", content="Hi")]
        )
        with pytest.raises(ValueError, match="Could not resolve provider"):
            service._resolve_provider(request)


class TestProxyServiceChatCompletion:
    @pytest.fixture
    def mock_session(self):
        session = AsyncMock()
        session.add = MagicMock()
        session.commit = AsyncMock()
        return session

    @pytest.fixture
    def mock_response(self):
        return ChatCompletionResponse(
            id="test-resp",
            model="mock-model",
            choices=[
                ChatCompletionChoice(
                    index=0,
                    message=ChatMessage(role="assistant", content="Hello!"),
                    finish_reason="stop"
                )
            ],
            usage=Usage(prompt_tokens=5, completion_tokens=2, total_tokens=7)
        )

    @pytest.mark.asyncio
    async def test_chat_completion_creates_trace_and_span(self, mock_session, mock_response):
        service = ProxyService(mock_session)
        
        request = ChatCompletionRequest(
            model="test",
            messages=[ChatMessage(role="user", content="Hi")],
            provider="mock"
        )
        
        with patch('app.services.proxy_service.get_envoy') as mock_get_envoy:
            mock_envoy = AsyncMock()
            mock_envoy.chat_completion = AsyncMock(return_value=mock_response)
            mock_get_envoy.return_value = mock_envoy
            
            response = await service.chat_completion(request, project_id="test-project")
            
            # Verify envoy was called
            mock_envoy.chat_completion.assert_called_once_with(request)
            
            # Verify session.add was called for Trace and Span
            assert mock_session.add.call_count >= 2  # At least Trace + Span
            
            # Verify commit was called
            mock_session.commit.assert_called()
            
            # Verify response returned
            assert response.id == "test-resp"

    @pytest.mark.asyncio
    async def test_chat_completion_handles_error(self, mock_session):
        service = ProxyService(mock_session)
        
        request = ChatCompletionRequest(
            model="test",
            messages=[ChatMessage(role="user", content="Hi")],
            provider="mock"
        )
        
        with patch('app.services.proxy_service.get_envoy') as mock_get_envoy:
            mock_envoy = AsyncMock()
            mock_envoy.chat_completion = AsyncMock(side_effect=Exception("Provider error"))
            mock_get_envoy.return_value = mock_envoy
            
            with pytest.raises(Exception, match="Provider error"):
                await service.chat_completion(request)
            
            # Should still commit (to save error trace)
            mock_session.commit.assert_called()
