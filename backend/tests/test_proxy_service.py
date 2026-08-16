"""
Unit tests for ProxyService.
Tests provider resolution, tracing, and error handling.
Uses mocking to avoid real DB and API calls.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.services.proxy_service import ProxyService
from app.schemas.proxy import (
    ChatCompletionChunk,
    ChatCompletionChunkChoice,
    ChatCompletionChunkDelta,
    ChatCompletionRequest,
    ChatMessage,
    ChatCompletionResponse,
    Usage,
    ChatCompletionChoice,
)


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
            assert response.log_id

    @pytest.mark.asyncio
    async def test_successful_completion_is_cached_when_scoring_succeeds(self, mock_session, mock_response):
        service = ProxyService(mock_session)
        request = ChatCompletionRequest(
            model="test-cache-fix",
            messages=[ChatMessage(role="user", content="Cache me")],
            provider="mock",
        )

        with (
            patch('app.services.proxy_service.get_envoy') as mock_get_envoy,
            patch('app.services.proxy_service.get_cache') as mock_get_cache,
            patch('app.services.proxy_service.JobService') as mock_job_service,
        ):
            mock_envoy = AsyncMock()
            mock_envoy.chat_completion = AsyncMock(return_value=mock_response)
            mock_get_envoy.return_value = mock_envoy
            cache = AsyncMock()
            cache.get.return_value = None
            cache.normalize_encryption_key.return_value = None
            mock_get_cache.return_value = cache
            mock_job_service.return_value.create_job = AsyncMock()

            await service.chat_completion(request, project_id="test-project")

            cache.set.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_stream_returns_log_correlation_and_usage_metrics(self, mock_session):
        service = ProxyService(mock_session)
        request = ChatCompletionRequest(
            model="test-stream",
            messages=[ChatMessage(role="user", content="Hi")],
            provider="mock",
            stream=True,
        )

        async def chunks(_request):
            yield ChatCompletionChunk(
                id="stream-response",
                model="test-stream",
                choices=[ChatCompletionChunkChoice(
                    index=0,
                    delta=ChatCompletionChunkDelta(content="Hello"),
                )],
            )
            yield ChatCompletionChunk(
                id="stream-response",
                model="test-stream",
                choices=[],
                usage=Usage(prompt_tokens=3, completion_tokens=2, total_tokens=5),
            )

        with patch('app.services.proxy_service.get_envoy') as mock_get_envoy:
            mock_envoy = MagicMock()
            mock_envoy.stream_chat_completion = chunks
            mock_get_envoy.return_value = mock_envoy

            stream, trace_id, span_id, log_id = await service.stream_chat_completion(
                request, project_id="test-project"
            )
            events = [event async for event in stream]

            assert events[-1] == "data: [DONE]\n\n"
            assert trace_id and span_id and log_id.startswith("log_")
            assert f'"log_id":"{log_id}"' in events[0]
            added_logs = [call.args[0] for call in mock_session.add.call_args_list
                          if call.args and call.args[0].__class__.__name__ == "LogModel"]
            assert added_logs[-1].total_tokens == 5

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
                await service.chat_completion(request, bypass_cache=True)
            
            # Should still commit (to save error trace)
            mock_session.commit.assert_called()
