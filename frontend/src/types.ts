export interface Project {
  id: string;
  name: string;
  org_id: string;
}

export enum SpanType {
  LLM = 'llm',
  TOOL = 'tool',
  CHAIN = 'chain',
  RETRIEVER = 'retriever'
}

export interface SpanMetrics {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cost?: number; // Estimated cost in USD
  latency_ms: number;
}

export interface SpanAttributes {
  model?: string;
  provider?: string;
  temperature?: number;
  reasoning_effort?: 'low' | 'medium' | 'high'; // For Atom 1.2 / Phase 3 support
  reasoning_enabled?: boolean;
  reasoning_delta?: boolean;
  reasoning_step_ids?: string[];
  [key: string]: any;
}

export interface Span {
  id: string;
  trace_id: string;
  parent_id?: string | null;
  name: string;
  type: SpanType;
  start_time: number; // Unix timestamp ms
  end_time: number; // Unix timestamp ms
  status: 'success' | 'error';
  input: any;
  output: any;
  metrics: SpanMetrics;
  attributes: SpanAttributes;
  tags: string[];
  error_message?: string;
}

export interface Trace {
  id: string;
  root_span: Span;
  spans: Span[]; // Flat list of all spans in the trace
  project_id: string;
  timestamp: number;
  total_latency: number;
  total_cost: number;
  total_tokens: number;
  status: 'success' | 'error';
  tags: string[];
}
