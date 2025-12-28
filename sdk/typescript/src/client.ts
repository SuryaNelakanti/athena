import { ChatCompletionRequest, ChatCompletionResponse, TraceContext } from "./types";
import { createTraceContext } from "./context";

export interface AthenaClientOptions {
  baseUrl?: string;
  projectId?: string;
  apiKey?: string;
  timeoutMs?: number;
}

export class AthenaClient {
  private baseUrl: string;
  private projectId: string;
  private apiKey?: string;
  private timeoutMs?: number;

  constructor(options: AthenaClientOptions = {}) {
    this.baseUrl = (options.baseUrl || "http://localhost:8000").replace(/\/+$/, "");
    this.projectId = options.projectId || "proj_default";
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs;
  }

  async chatCompletion(
    request: ChatCompletionRequest,
    opts: { traceContext?: TraceContext; bypassCache?: boolean } = {}
  ): Promise<ChatCompletionResponse> {
    if (request.stream) {
      throw new Error("Streaming is not supported in the minimal SDK.");
    }

    const context = this.resolveContext(request, opts.traceContext);
    const body = {
      model: request.model,
      messages: request.messages,
      stream: request.stream,
      provider: request.provider,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      top_p: request.topP,
      frequency_penalty: request.frequencyPenalty,
      presence_penalty: request.presencePenalty,
      stop: request.stop,
      trace_id: context.traceId,
      trace_group_id: context.traceGroupId,
      parent_span_id: context.parentSpanId || undefined,
      project_id: request.projectId || this.projectId,
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Athena-Project-ID": this.projectId,
      "X-Athena-Trace-ID": context.traceId,
    };
    if (context.parentSpanId) {
      headers["X-Athena-Parent-Span-ID"] = context.parentSpanId;
    }
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }
    if (opts.bypassCache) {
      headers["X-Athena-Cache-Control"] = "no-cache";
    }

    const controller = this.timeoutMs ? new AbortController() : undefined;
    const timeout = this.timeoutMs
      ? setTimeout(() => controller?.abort(), this.timeoutMs)
      : undefined;

    try {
      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller?.signal,
      });
      const payload = await response.text();
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${payload}`);
      }
      return JSON.parse(payload) as ChatCompletionResponse;
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  private resolveContext(
    request: ChatCompletionRequest,
    traceContext?: TraceContext
  ): TraceContext {
    if (traceContext) {
      return traceContext;
    }
    if (request.traceId || request.traceGroupId) {
      return createTraceContext({
        traceId: request.traceId,
        traceGroupId: request.traceGroupId,
        parentSpanId: request.parentSpanId ?? null,
      });
    }
    return createTraceContext();
  }
}
