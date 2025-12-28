import { describe, it, expect } from "vitest";
import { createTraceContext, contextFromResponse, withParentSpan } from "../src/context";

describe("trace context", () => {
  it("defaults traceGroupId to traceId", () => {
    const ctx = createTraceContext();
    expect(ctx.traceId.startsWith("trace_")).toBe(true);
    expect(ctx.traceGroupId).toBe(ctx.traceId);
  });

  it("supports parent span updates", () => {
    const ctx = createTraceContext();
    const updated = withParentSpan(ctx, "span_123");
    expect(updated.parentSpanId).toBe("span_123");
  });

  it("derives context from response", () => {
    const fallback = createTraceContext({ traceId: "trace_abc", traceGroupId: "group_abc" });
    const ctx = contextFromResponse({ span_id: "span_999" }, fallback);
    expect(ctx.traceId).toBe("trace_abc");
    expect(ctx.traceGroupId).toBe("group_abc");
    expect(ctx.parentSpanId).toBe("span_999");
  });
});
