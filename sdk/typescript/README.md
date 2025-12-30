# Athena TypeScript SDK (Minimal)

This SDK provides a small client for Athena's proxy API plus trace context
helpers. It guarantees a `traceId` is always sent with proxy calls.

Quickstart
1. Start the Athena backend (`npm run dev` from the repo root or `uvicorn` from `backend/`).
2. Install the SDK: `npm install ./sdk/typescript`
3. Run the example below.

Usage
```ts
import { AthenaClient, createTraceContext, contextFromResponse } from "athena-sdk";

const client = new AthenaClient({
  baseUrl: "http://localhost:8000",
  projectId: "proj_alpha",
  maxRetries: 2,
});

const response = await client.chatCompletion({
  model: "mock-model",
  messages: [{ role: "user", content: "Hello" }],
});

const nextContext = contextFromResponse(response);
await client.chatCompletion(
  {
    model: "mock-model",
    messages: [{ role: "user", content: "Follow up" }],
  },
  { traceContext: nextContext }
);
```

Fail-open (optional)
If the proxy is unreachable, the SDK can fall back to an OpenAI-compatible endpoint.
```ts
const client = new AthenaClient({
  baseUrl: "http://localhost:8000",
  projectId: "proj_alpha",
  failOpen: true,
  fallbackBaseUrl: "https://api.openai.com/v1",
  fallbackApiKey: "YOUR_OPENAI_API_KEY",
});
```
Note: Fail-open calls bypass Athena logging and do not return span or trace IDs.

Notes
- Uses `fetch` (Node 18+ or a fetch polyfill).
- Use `streamChatCompletion()` for streaming responses.
- `traceId` format is `trace_{uuid}`.
- Retry/backoff settings use milliseconds in TypeScript.
- `cacheKey` enables AES-256-GCM cache encryption (base64url or hex for 32-byte key).
