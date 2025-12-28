export type ChatRole = "system" | "user" | "assistant" | "tool" | string;

export interface ChatMessage {
  role: ChatRole;
  content: string;
  name?: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  provider?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string[];
  traceId?: string;
  traceGroupId?: string;
  parentSpanId?: string;
  projectId?: string;
}

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost?: number;
  latency_ms?: number;
}

export interface ChatCompletionChoice {
  index: number;
  message: ChatMessage;
  finish_reason?: string;
}

export interface ChatCompletionResponse {
  id: string;
  object?: string;
  created?: number;
  model?: string;
  choices: ChatCompletionChoice[];
  usage?: Usage;
  provider?: string;
  trace_id?: string;
  span_id?: string;
  trace_group_id?: string;
}

export interface TraceContext {
  traceId: string;
  traceGroupId: string;
  parentSpanId?: string | null;
}

export type StreamChunk = Record<string, unknown>;
