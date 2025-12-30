# Athena Python SDK (Minimal)

This SDK provides a lightweight client for Athena's proxy API plus trace context
helpers. It guarantees a `trace_id` is always sent with proxy calls.

Quickstart
1. Start the Athena backend (`npm run dev` from the repo root or `uvicorn` from `backend/`).
2. Install the SDK: `pip install -e sdk/python`
3. Run the example below.

Usage
```python
from athena_sdk import AthenaClient, observe, context_from_response

client = AthenaClient(
    base_url="http://localhost:8000",
    project_id="proj_alpha",
    max_retries=2,
)

@observe
def run():
    response = client.chat_completion(
        {
            "model": "mock-model",
            "messages": [{"role": "user", "content": "Hello"}],
        }
    )
    next_ctx = context_from_response(response)
    client.chat_completion(
        {
            "model": "mock-model",
            "messages": [{"role": "user", "content": "Follow up"}],
        },
        trace_context=next_ctx,
    )

run()
```

Fail-open (optional)
If the proxy is unreachable, the SDK can fall back to an OpenAI-compatible endpoint.
```python
client = AthenaClient(
    base_url="http://localhost:8000",
    project_id="proj_alpha",
    fail_open=True,
    fallback_base_url="https://api.openai.com/v1",
    fallback_api_key="YOUR_OPENAI_API_KEY",
)
```
Note: Fail-open calls bypass Athena logging and do not return span or trace IDs.

Notes
- The SDK uses the Python standard library only.
- `trace_group_id` defaults to `trace_id` unless provided.
- Use `context_from_response` to chain spans with `parent_span_id`.
- `trace_id` format is `trace_{uuid}`.
- Use `stream_chat_completion()` for streaming responses.
- Retry/backoff settings use seconds in Python.
- `cache_key` enables AES-256-GCM cache encryption (base64url or hex for 32-byte key).
