import type { ChatCompletionRequest, ChatCompletionResponse, StreamChunk, TraceContext } from "./types";
import { createTraceContext } from "./context";
import { AthenaClientError } from "./errors";
import { decodeChatCompletionResponse, decodeSseStream } from "./responseDecoding";

export { AthenaClientError };

export interface AthenaClientOptions {
  baseUrl?: string;
  projectId?: string;
  apiKey?: string;
  timeoutMs?: number;
  maxRetries?: number;
  retryBackoffMs?: number;
  retryMaxDelayMs?: number;
  retryJitterMs?: number;
  failOpen?: boolean;
  fallbackBaseUrl?: string;
  fallbackApiKey?: string;
  fallbackHeaders?: Record<string, string>;
}

interface CompletionOptions {
  traceContext?: TraceContext;
  bypassCache?: boolean;
  cacheKey?: string;
}

interface TimeoutGuard {
  signal?: AbortSignal;
  clear: () => void;
}

const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

class HttpResponseError extends AthenaClientError {
  constructor(status: number, body: string, fallback = false) {
    super(`${fallback ? "Fail-open HTTP" : "HTTP"} ${status}: ${body}`, status);
  }
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const validateRetryCount = (value: number): number => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError("maxRetries must be a non-negative safe integer.");
  }
  return value;
};

const validateDuration = (name: string, value: number, allowZero = true): number => {
  if (!Number.isFinite(value) || value < 0 || (!allowZero && value === 0)) {
    const minimum = allowZero ? "non-negative" : "greater than zero";
    throw new RangeError(`${name} must be a finite number ${minimum}.`);
  }
  return value;
};

export class AthenaClient {
  private baseUrl: string;
  private projectId: string;
  private apiKey?: string;
  private timeoutMs?: number;
  private maxRetries: number;
  private retryBackoffMs: number;
  private retryMaxDelayMs: number;
  private retryJitterMs: number;
  private failOpen: boolean;
  private fallbackBaseUrl: string;
  private fallbackApiKey?: string;
  private fallbackHeaders: Record<string, string>;

  constructor(options: AthenaClientOptions = {}) {
    this.baseUrl = (options.baseUrl || "http://localhost:8000").replace(/\/+$/, "");
    this.projectId = options.projectId || "proj_default";
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs === undefined
      ? undefined
      : validateDuration("timeoutMs", options.timeoutMs, false);
    this.maxRetries = validateRetryCount(options.maxRetries ?? 0);
    this.retryBackoffMs = validateDuration("retryBackoffMs", options.retryBackoffMs ?? 200);
    this.retryMaxDelayMs = validateDuration("retryMaxDelayMs", options.retryMaxDelayMs ?? 2000);
    this.retryJitterMs = validateDuration("retryJitterMs", options.retryJitterMs ?? 100);
    this.failOpen = options.failOpen ?? false;
    this.fallbackBaseUrl = (options.fallbackBaseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
    this.fallbackApiKey = options.fallbackApiKey;
    this.fallbackHeaders = options.fallbackHeaders || {};
  }

  async chatCompletion(
    request: ChatCompletionRequest,
    opts: CompletionOptions = {}
  ): Promise<ChatCompletionResponse> {
    if (request.stream) {
      throw new AthenaClientError("Use streamChatCompletion for streaming requests.");
    }

    const context = this.resolveContext(request, opts.traceContext);
    const body = this.buildRequestBody(request, context, false);
    const headers = this.buildHeaders(context, opts, false);

    const fallbackBody = this.buildFallbackBody(body, false);

    try {
      const { response, payload } = await this.postTextWithRetry(
        `${this.baseUrl}/v1/chat/completions`,
        headers,
        body
      );
      if (!response.ok) {
        if (this.shouldFailOpen(response.status)) {
          return this.requestFallback(fallbackBody);
        }
        throw new HttpResponseError(response.status, payload);
      }
      return decodeChatCompletionResponse(payload, "Athena proxy");
    } catch (err) {
      if (err instanceof HttpResponseError) throw err;
      if (this.shouldFailOpen()) {
        return this.requestFallback(fallbackBody);
      }
      if (err instanceof AthenaClientError) throw err;
      throw new AthenaClientError(`Request failed: ${errorMessage(err)}`, undefined, err);
    }
  }

  async *streamChatCompletion(
    request: ChatCompletionRequest,
    opts: CompletionOptions = {}
  ): AsyncGenerator<StreamChunk> {
    const context = this.resolveContext(request, opts.traceContext);
    const body = this.buildRequestBody(request, context, true);
    const headers = this.buildHeaders(context, opts, true);

    const fallbackBody = this.buildFallbackBody(body, true);
    yield* this.streamWithRetry(
      `${this.baseUrl}/v1/chat/completions`,
      headers,
      body,
      { source: "Athena proxy", fallbackBody }
    );
  }

  private buildRequestBody(
    request: ChatCompletionRequest,
    context: TraceContext,
    stream: boolean
  ): Record<string, unknown> {
    return {
      model: request.model,
      messages: request.messages,
      stream,
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
  }

  private buildHeaders(
    context: TraceContext,
    options: CompletionOptions,
    stream: boolean
  ): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Athena-Project-ID": this.projectId,
      "X-Athena-Trace-ID": context.traceId,
    };
    if (stream) headers.Accept = "text/event-stream";
    if (context.parentSpanId) headers["X-Athena-Parent-Span-ID"] = context.parentSpanId;
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
    if (options.bypassCache) headers["X-Athena-Cache-Control"] = "no-cache";
    if (options.cacheKey) headers["X-Athena-Cache-Key"] = options.cacheKey;
    return headers;
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

  private shouldFailOpen(status?: number): boolean {
    if (!this.failOpen) {
      return false;
    }
    if (status === undefined) {
      return true;
    }
    return RETRYABLE_STATUSES.has(status);
  }

  private buildFallbackBody(body: Record<string, unknown>, stream: boolean): Record<string, unknown> {
    const fallbackBody = { ...body };
    delete fallbackBody.trace_id;
    delete fallbackBody.trace_group_id;
    delete fallbackBody.parent_span_id;
    delete fallbackBody.project_id;
    delete fallbackBody.provider;
    fallbackBody.stream = stream;
    return fallbackBody;
  }

  private getFallbackHeaders(stream: boolean): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...this.fallbackHeaders,
    };
    if (stream) {
      headers.Accept = headers.Accept || "text/event-stream";
    }
    if (!headers.Authorization) {
      if (!this.fallbackApiKey) {
        throw new AthenaClientError("Fail-open enabled but fallbackApiKey is not set.");
      }
      headers.Authorization = `Bearer ${this.fallbackApiKey}`;
    }
    return headers;
  }

  private async postTextWithRetry(
    url: string,
    headers: Record<string, string>,
    body: Record<string, unknown>
  ): Promise<{ response: Response; payload: string }> {
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const timeout = this.createTimeoutGuard();
      try {
        const response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: timeout.signal,
        });
        const payload = await response.text();
        if (this.shouldRetry(response.status) && attempt < this.maxRetries) {
          await this.sleepBackoff(attempt);
          continue;
        }
        return { response, payload };
      } catch (error) {
        if (error instanceof AthenaClientError) throw error;
        if (attempt >= this.maxRetries) throw error;
        await this.sleepBackoff(attempt);
      } finally {
        timeout.clear();
      }
    }
    throw new AthenaClientError("Request failed after retries.");
  }

  private async requestFallback(body: Record<string, unknown>): Promise<ChatCompletionResponse> {
    const url = `${this.fallbackBaseUrl}/chat/completions`;
    const headers = this.getFallbackHeaders(false);
    try {
      const { response, payload } = await this.postTextWithRetry(url, headers, body);
      if (!response.ok) {
        throw new HttpResponseError(response.status, payload, true);
      }
      return decodeChatCompletionResponse(payload, "Fail-open provider");
    } catch (err) {
      if (err instanceof AthenaClientError) throw err;
      throw new AthenaClientError(`Fail-open request failed: ${errorMessage(err)}`, undefined, err);
    }
  }

  private async *streamFallback(body: Record<string, unknown>): AsyncGenerator<StreamChunk> {
    const url = `${this.fallbackBaseUrl}/chat/completions`;
    const headers = this.getFallbackHeaders(true);
    yield* this.streamWithRetry(url, headers, body, { source: "Fail-open provider" });
  }

  private async *streamWithRetry(
    url: string,
    headers: Record<string, string>,
    body: Record<string, unknown>,
    options: { source: "Athena proxy" | "Fail-open provider"; fallbackBody?: Record<string, unknown> }
  ): AsyncGenerator<StreamChunk> {
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      let yielded = false;
      const timeout = this.createTimeoutGuard();
      try {
        const response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: timeout.signal,
        });
        if (!response.ok) {
          const payload = await response.text();
          if (this.shouldRetry(response.status) && attempt < this.maxRetries) {
            await this.sleepBackoff(attempt);
            continue;
          }
          if (options.fallbackBody && this.shouldFailOpen(response.status)) {
            yield* this.streamFallback(options.fallbackBody);
            return;
          }
          throw new HttpResponseError(response.status, payload, options.source === "Fail-open provider");
        }

        for await (const chunk of decodeSseStream(
          response,
          options.source === "Athena proxy"
        )) {
          yielded = true;
          yield chunk;
        }
        return;
      } catch (err) {
        if (err instanceof HttpResponseError) throw err;
        if (yielded || attempt >= this.maxRetries) {
          if (!yielded && options.fallbackBody && this.shouldFailOpen()) {
            yield* this.streamFallback(options.fallbackBody);
            return;
          }
          if (err instanceof AthenaClientError && options.source === "Athena proxy") throw err;
          const prefix = options.source === "Fail-open provider"
            ? "Fail-open stream failed"
            : "Request failed";
          throw new AthenaClientError(`${prefix}: ${errorMessage(err)}`, undefined, err);
        }
        await this.sleepBackoff(attempt);
      } finally {
        timeout.clear();
      }
    }
    throw new AthenaClientError(`${options.source} stream failed after retries.`);
  }

  private shouldRetry(status: number): boolean {
    return RETRYABLE_STATUSES.has(status);
  }

  private createTimeoutGuard(): TimeoutGuard {
    if (this.timeoutMs === undefined) {
      return { clear: () => undefined };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    return {
      signal: controller.signal,
      clear: () => clearTimeout(timeout),
    };
  }

  private async sleepBackoff(attempt: number): Promise<void> {
    const base = Math.min(this.retryBackoffMs * 2 ** attempt, this.retryMaxDelayMs);
    const jitter = this.retryJitterMs > 0 ? (Math.random() * 2 - 1) * this.retryJitterMs : 0;
    const delay = Math.max(0, base + jitter);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}
