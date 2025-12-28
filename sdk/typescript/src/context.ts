import { TraceContext } from "./types";

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
}

export function createTraceId(): string {
  return `trace_${randomId()}`;
}

export function createTraceContext(
  init: Partial<TraceContext> = {}
): TraceContext {
  const traceId = init.traceId || createTraceId();
  return {
    traceId,
    traceGroupId: init.traceGroupId || traceId,
    parentSpanId: init.parentSpanId ?? null,
  };
}

export function withParentSpan(
  context: TraceContext,
  parentSpanId: string | null
): TraceContext {
  return {
    traceId: context.traceId,
    traceGroupId: context.traceGroupId,
    parentSpanId,
  };
}

export function contextFromResponse(
  response: { trace_id?: string; trace_group_id?: string; span_id?: string },
  fallback?: TraceContext
): TraceContext {
  const traceId = response.trace_id || fallback?.traceId || createTraceId();
  const traceGroupId = response.trace_group_id || fallback?.traceGroupId || traceId;
  return {
    traceId,
    traceGroupId,
    parentSpanId: response.span_id ?? null,
  };
}
