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

export interface Dataset {
  id: string;
  project_id: string;
  name: string;
  description?: string;
  version: number;
  created_at: number;
}

export interface DatasetRow {
  id: string;
  dataset_id: string;
  input: any;
  expected?: any;
  metadata: Record<string, any>;
  created_at: number;
}

export interface Experiment {
  id: string;
  project_id: string;
  dataset_id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  summary: Record<string, any>;
  created_at: number;
}

export interface ExperimentResult {
  id: string;
  experiment_id: string;
  dataset_row_id: string;
  output: any;
  scores: Record<string, any>;
  latency_ms: number;
  created_at: number;
}

export interface ModelRegistry {
  id: string;
  provider: 'openai' | 'anthropic' | 'gemini' | 'mock' | string;
  model_id: string;
  display_name?: string | null;
  enabled: boolean;
  created_at: number;
}

export interface ExperimentVersion {
  id: string;
  experiment_id: string;
  version_number: number;
  parent_version_id?: string | null;
  dataset_version_pinned: number;
  config: Record<string, any>;
  created_at: number;
}

export interface ExperimentRun {
  id: string;
  experiment_version_id: string;
  status: 'queued' | 'running' | 'completed' | 'error' | 'canceled' | string;
  summary: Record<string, any>;
  created_at: number;
  started_at?: number | null;
  completed_at?: number | null;
  cancel_requested_at?: number | null;
}

export interface ExperimentRunResult {
  id: string;
  run_id: string;
  dataset_row_id: string;
  output: any;
  scores: Record<string, any>;
  latency_ms: number;
  created_at: number;
}

// --- Log types (first-class, separate from traces) ---

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface Log {
  id: string;
  project_id: string;
  trace_id?: string;
  span_id?: string;
  level: LogLevel;
  message: string;
  timestamp: number;
  attributes: Record<string, any>;
  metadata: Record<string, any>;
  created_at: number;
}
