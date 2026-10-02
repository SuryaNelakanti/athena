export type LogStatus = 'success' | 'error' | string;
export type LogEventType = 'llm_call' | 'llm_stream' | 'guardrail' | 'audit' | 'alert' | 'compliance' | 'custom' | string;

export interface Log {
  id: string;
  project_id: string;
  trace_id?: string;
  span_id?: string;
  level?: string;
  event_type?: LogEventType;
  status?: LogStatus;
  message: string;
  timestamp: number;
  // Proxy call metrics
  latency_ms?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cost?: number;
  model?: string;
  provider?: string;
  // Structured data
  attributes: Record<string, unknown>;
  log_metadata: Record<string, unknown>;
  created_at: number;
}

export interface LogCreateInput {
  project_id: string;
  level?: string;
  status?: string;
  event_type?: string;
  message: string;
  timestamp?: number;
  trace_id?: string;
  span_id?: string;
  attributes?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface SearchDocsResponse {
  query: string;
  count: number;
  results: Array<{ path: string; line: number; snippet: string }>;
}

// --- AQL ---

export interface AqlQueryResponse {
  shape: string;
  schema: string[];
  data: Record<string, unknown>[];
  query?: string;
}

export interface AqlFilter {
  field: string;
  op: string;
  value: unknown;
}

export interface AqlMeasure {
  func: string;
  field?: string;
  alias?: string;
}

export interface AqlSort {
  field: string;
  direction?: 'asc' | 'desc' | string;
}

export interface AqlBuilder {
  shape: string;
  params?: Record<string, unknown>;
  select?: string[];
  filters?: AqlFilter[];
  dimensions?: string[];
  measures?: AqlMeasure[];
  sort?: AqlSort;
  limit?: number;
}

export interface AqlQueryRequest {
  query?: string;
  builder?: AqlBuilder;
}
