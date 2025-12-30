import { ChatCompletionRequest, ChatCompletionResponse, StreamChunk, TraceContext } from "./types";
import { createTraceContext } from "./context";

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
    this.timeoutMs = options.timeoutMs;
    this.maxRetries = options.maxRetries ?? 0;
    this.retryBackoffMs = options.retryBackoffMs ?? 200;
    this.retryMaxDelayMs = options.retryMaxDelayMs ?? 2000;
    this.retryJitterMs = options.retryJitterMs ?? 100;
    this.failOpen = options.failOpen ?? false;
    this.fallbackBaseUrl = (options.fallbackBaseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
    this.fallbackApiKey = options.fallbackApiKey;
    this.fallbackHeaders = options.fallbackHeaders || {};
  }

  async chatCompletion(
    request: ChatCompletionRequest,
    opts: { traceContext?: TraceContext; bypassCache?: boolean; cacheKey?: string } = {}
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
    if (opts.cacheKey) {
      headers["X-Athena-Cache-Key"] = opts.cacheKey;
    }

    const fallbackBody = this.buildFallbackBody(body, false);

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
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
          if (this.shouldRetry(response.status) && attempt < this.maxRetries) {
            await this.sleepBackoff(attempt);
            continue;
          }
          if (this.shouldFailOpen(response.status)) {
            return this.requestFallback(fallbackBody);
          }
          throw new Error(`HTTP ${response.status}: ${payload}`);
        }
        return JSON.parse(payload) as ChatCompletionResponse;
      } catch (err) {
        if (attempt >= this.maxRetries) {
          if (this.shouldFailOpen()) {
            return this.requestFallback(fallbackBody);
          }
          throw err;
        }
        await this.sleepBackoff(attempt);
      } finally {
        if (timeout) {
          clearTimeout(timeout);
        }
      }
    }
    throw new Error("Request failed after retries.");
  }

  async *streamChatCompletion(
    request: ChatCompletionRequest,
    opts: { traceContext?: TraceContext; bypassCache?: boolean; cacheKey?: string } = {}
  ): AsyncGenerator<StreamChunk> {
    const context = this.resolveContext(request, opts.traceContext);
    const body = {
      model: request.model,
      messages: request.messages,
      stream: true,
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
      Accept: "text/event-stream",
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
    if (opts.cacheKey) {
      headers["X-Athena-Cache-Key"] = opts.cacheKey;
    }

    const fallbackBody = this.buildFallbackBody(body, true);

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      let yielded = false;
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

        if (!response.ok) {
          const payload = await response.text();
          if (this.shouldRetry(response.status) && attempt < this.maxRetries) {
            await this.sleepBackoff(attempt);
            continue;
          }
          if (this.shouldFailOpen(response.status)) {
            yield* this.streamFallback(fallbackBody);
            return;
          }
          throw new Error(`HTTP ${response.status}: ${payload}`);
        }

        for await (const chunk of this.parseStream(response)) {
          yielded = true;
          yield chunk;
        }
        return;
      } catch (err) {
        if (yielded || attempt >= this.maxRetries) {
          if (!yielded && this.shouldFailOpen()) {
            yield* this.streamFallback(fallbackBody);
            return;
          }
          throw err;
        }
        await this.sleepBackoff(attempt);
      } finally {
        if (timeout) {
          clearTimeout(timeout);
        }
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

  private shouldFailOpen(status?: number): boolean {
    if (!this.failOpen) {
      return false;
    }
    if (status === undefined) {
      return true;
    }
    return [408, 429, 500, 502, 503, 504].includes(status);
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
        throw new Error("Fail-open enabled but fallbackApiKey is not set.");
      }
      headers.Authorization = `Bearer ${this.fallbackApiKey}`;
    }
    return headers;
  }

  private async requestFallback(body: Record<string, unknown>): Promise<ChatCompletionResponse> {
    const url = `${this.fallbackBaseUrl}/chat/completions`;
    const headers = this.getFallbackHeaders(false);
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });
        const payload = await response.text();
        if (!response.ok) {
          if (this.shouldRetry(response.status) && attempt < this.maxRetries) {
            await this.sleepBackoff(attempt);
            continue;
          }
          throw new Error(`Fail-open HTTP ${response.status}: ${payload}`);
        }
        return JSON.parse(payload) as ChatCompletionResponse;
      } catch (err) {
        if (attempt >= this.maxRetries) {
          throw err;
        }
        await this.sleepBackoff(attempt);
      }
    }
    throw new Error("Fail-open request failed after retries.");
  }

  private async *streamFallback(body: Record<string, unknown>): AsyncGenerator<StreamChunk> {
    const url = `${this.fallbackBaseUrl}/chat/completions`;
    const headers = this.getFallbackHeaders(true);
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      let yielded = false;
      try {
        const response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          const payload = await response.text();
          if (this.shouldRetry(response.status) && attempt < this.maxRetries) {
            await this.sleepBackoff(attempt);
            continue;
          }
          throw new Error(`Fail-open HTTP ${response.status}: ${payload}`);
        }

        for await (const chunk of this.parseStream(response)) {
          yielded = true;
          yield chunk;
        }
        return;
      } catch (err) {
        if (yielded || attempt >= this.maxRetries) {
          throw err;
        }
        await this.sleepBackoff(attempt);
      }
    }
    throw new Error("Fail-open stream failed after retries.");
  }

  private async *parseStream(response: Response): AsyncGenerator<StreamChunk> {
    if (!response.body) {
      throw new Error("Streaming response missing body.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith("data:")) {
          continue;
        }
        const data = line.slice(5).trim();
        if (!data) {
          continue;
        }
        if (data === "[DONE]") {
          return;
        }
        try {
          yield JSON.parse(data) as StreamChunk;
        } catch {
          yield { raw: data };
        }
      }
    }
  }

  private shouldRetry(status: number): boolean {
    return [408, 429, 500, 502, 503, 504].includes(status);
  }

  private async sleepBackoff(attempt: number): Promise<void> {
    const base = Math.min(this.retryBackoffMs * 2 ** attempt, this.retryMaxDelayMs);
    const jitter = this.retryJitterMs > 0 ? (Math.random() * 2 - 1) * this.retryJitterMs : 0;
    const delay = Math.max(0, base + jitter);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}
