"""
Unit tests for Proxy Schemas (Pydantic models).
Ensures serialization, deserialization, and validation work correctly.
"""
import pytest
from app.schemas.proxy import (
    ChatMessage, ChatCompletionRequest, ChatCompletionResponse,
    ChatCompletionChoice, Usage, ChatCompletionChunk,
    ChatCompletionChunkChoice, ChatCompletionChunkDelta, ProviderConfig
)


class TestChatMessage:
    def test_create_basic_message(self):
        msg = ChatMessage(role="user", content="Hello")
        assert msg.role == "user"
        assert msg.content == "Hello"
        assert msg.name is None

    def test_message_with_name(self):
        msg = ChatMessage(role="assistant", content="Hi", name="Bot")
        assert msg.name == "Bot"


class TestChatCompletionRequest:
    def test_minimal_request(self):
        req = ChatCompletionRequest(
            model="gpt-3.5-turbo",
            messages=[ChatMessage(role="user", content="Test")]
        )
        assert req.model == "gpt-3.5-turbo"
        assert len(req.messages) == 1
        assert req.stream is False
        assert req.temperature == 1.0

    def test_request_with_athena_extensions(self):
        req = ChatCompletionRequest(
            model="claude-3-opus",
            messages=[ChatMessage(role="user", content="Test")],
            provider="anthropic",
            trace_id="trace-123"
        )
        assert req.provider == "anthropic"
        assert req.trace_id == "trace-123"

    def test_serialization_roundtrip(self):
        original = ChatCompletionRequest(
            model="test",
            messages=[ChatMessage(role="user", content="Hello")],
            temperature=0.7,
            max_tokens=100
        )
        json_str = original.model_dump_json()
        restored = ChatCompletionRequest.model_validate_json(json_str)
        assert restored.model == original.model
        assert restored.temperature == original.temperature


class TestChatCompletionResponse:
    def test_response_structure(self):
        resp = ChatCompletionResponse(
            id="resp-123",
            model="gpt-3.5-turbo",
            choices=[
                ChatCompletionChoice(
                    index=0,
                    message=ChatMessage(role="assistant", content="Hi!"),
                    finish_reason="stop"
                )
            ],
            usage=Usage(prompt_tokens=5, completion_tokens=2, total_tokens=7)
        )
        assert resp.id == "resp-123"
        assert resp.object == "chat.completion"
        assert len(resp.choices) == 1
        assert resp.usage.total_tokens == 7


class TestChatCompletionChunk:
    def test_streaming_chunk(self):
        chunk = ChatCompletionChunk(
            id="chunk-1",
            model="gpt-4",
            choices=[
                ChatCompletionChunkChoice(
                    index=0,
                    delta=ChatCompletionChunkDelta(content="Hello"),
                    finish_reason=None
                )
            ]
        )
        assert chunk.object == "chat.completion.chunk"
        assert chunk.choices[0].delta.content == "Hello"

    def test_reasoning_delta(self):
        chunk = ChatCompletionChunk(
            id="chunk-2",
            model="o1-preview",
            choices=[
                ChatCompletionChunkChoice(
                    index=0,
                    delta=ChatCompletionChunkDelta(
                        content=None,
                        reasoning_content="Let me think..."
                    ),
                    finish_reason=None
                )
            ]
        )
        assert chunk.choices[0].delta.reasoning_content == "Let me think..."


class TestProviderConfig:
    def test_provider_config(self):
        config = ProviderConfig(
            provider_name="openai",
            api_key="sk-test",
            base_url="https://api.openai.com"
        )
        assert config.provider_name == "openai"
        assert config.api_key == "sk-test"
