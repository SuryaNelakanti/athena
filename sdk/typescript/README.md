# Athena TypeScript SDK (Minimal)

This SDK provides a small client for Athena's proxy API plus trace context
helpers. It guarantees a `traceId` is always sent with proxy calls.

Usage
```ts
import { AthenaClient, createTraceContext, contextFromResponse } from "athena-sdk";

const client = new AthenaClient({
  baseUrl: "http://localhost:8000",
  projectId: "proj_alpha",
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

Notes
- Uses `fetch` (Node 18+ or a fetch polyfill).
- Streaming is not supported in this minimal SDK.
