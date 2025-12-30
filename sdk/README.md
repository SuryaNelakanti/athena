# Athena SDKs

This folder contains minimal Python and TypeScript SDKs for Athena's proxy API.

Contents
- `sdk/python`: Python SDK with trace context helpers and `@observe`.
- `sdk/typescript`: TypeScript SDK with trace context helpers.

Quickstart (Local)
1. Start the Athena backend (`npm run dev` from the repo root or `uvicorn` from `backend/`).
2. Install an SDK:
   - Python: `pip install -e sdk/python`
   - TypeScript: `npm install ./sdk/typescript`
3. Use the examples in `sdk/python/README.md` or `sdk/typescript/README.md`.

Both SDKs enforce that a `trace_id` is always included in proxy calls. Each
call uses a `trace_group_id` (defaults to `trace_id`) and supports
`parent_span_id` for nesting spans.

Trace ID Format
- `trace_id` values are generated as `trace_{uuid}` unless you supply one.

Trace Context Propagation (Headers)
The SDKs set `X-Athena-Trace-ID` and `X-Athena-Parent-Span-ID` based on the trace context.

Python
```python
from athena_sdk import AthenaClient, context_from_response, new_trace_context

client = AthenaClient(base_url="http://localhost:8000", project_id="proj_default")
context = new_trace_context()

response = client.chat_completion(
    {"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "Hi"}]},
    trace_context=context,
)

child_context = context_from_response(response, fallback=context)
client.chat_completion(
    {"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "Next"}]},
    trace_context=child_context,
)
```

TypeScript
```ts
import { AthenaClient, contextFromResponse, createTraceContext } from "athena-sdk";

const client = new AthenaClient({ baseUrl: "http://localhost:8000", projectId: "proj_default" });
const context = createTraceContext();

const response = await client.chatCompletion(
  { model: "gpt-4o-mini", messages: [{ role: "user", content: "Hi" }] },
  { traceContext: context }
);

const childContext = contextFromResponse(response, context);
await client.chatCompletion(
  { model: "gpt-4o-mini", messages: [{ role: "user", content: "Next" }] },
  { traceContext: childContext }
);
```

Fail-open (optional)
If the proxy is unreachable, the SDK can fall back to an OpenAI-compatible endpoint.
Configure `fail_open`/`failOpen` with a fallback base URL and API key.

Python
```python
client = AthenaClient(
    base_url="http://localhost:8000",
    project_id="proj_default",
    fail_open=True,
    fallback_base_url="https://api.openai.com/v1",
    fallback_api_key="YOUR_OPENAI_API_KEY",
)
```

TypeScript
```ts
const client = new AthenaClient({
  baseUrl: "http://localhost:8000",
  projectId: "proj_default",
  failOpen: true,
  fallbackBaseUrl: "https://api.openai.com/v1",
  fallbackApiKey: "YOUR_OPENAI_API_KEY",
});
```
Note: Fail-open calls bypass Athena logging and do not return span or trace IDs.

Retries and Streaming
- Both SDKs support configurable retry/backoff and streaming calls.
- Python retry config uses seconds; TypeScript uses milliseconds.

Cache Encryption
- Both SDKs accept `cache_key`/`cacheKey` to enable AES-256-GCM cache encryption (base64url or hex for 32-byte key).
