# Athena Python SDK (Minimal)

This SDK provides a lightweight client for Athena's proxy API plus trace context
helpers. It guarantees a `trace_id` is always sent with proxy calls.

Usage
```python
from athena_sdk import AthenaClient, observe, context_from_response

client = AthenaClient(
    base_url="http://localhost:8000",
    project_id="proj_alpha",
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

Notes
- The SDK uses the Python standard library only.
- `trace_group_id` defaults to `trace_id` unless provided.
- Use `context_from_response` to chain spans with `parent_span_id`.
- `trace_id` format is `trace_{uuid}`.
