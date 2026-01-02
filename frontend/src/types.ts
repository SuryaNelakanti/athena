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
  parent_trace_id?: string | null;
  trace_group_id?: string | null;
  input_span_id?: string | null;
  output_span_id?: string | null;
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
  kind?: 'eval' | 'knowledge' | 'mixed' | string;
  schema?: Record<string, any>;
  schema_version?: number;
  review_policy?: Record<string, any>;
  row_counts?: DatasetRowCounts;
  created_at: number;
}

export interface DatasetRowCounts {
  total: number;
  eval: number;
  resource: number;
}

export interface DatasetRow {
  id: string;
  dataset_id: string;
  row_kind?: 'eval' | 'resource' | string;
  eval_label?: 'gold' | 'anti_pattern' | string | null;
  // Versioning fields
  logical_id: string;  // Groups revisions of the same logical row
  version: number;  // Revision number
  dataset_version?: number; // Dataset version when this revision was added     
  is_deleted: boolean;  // Tombstone marker
  // Content fields
  input: any;
  expected?: any;
  meta: Record<string, any>;
  example_type?: 'gold' | 'anti_pattern' | string;  // legacy
  source_trace_id?: string;  // If promoted from a trace
  created_at: number;
}

export interface DatasetVersion {
  id: string;
  dataset_id: string;
  version: number;
  action: 'insert' | 'update' | 'delete' | 'flush' | string;
  logical_id?: string | null;
  row_id?: string | null;
  meta: Record<string, any>;
  created_at: number;
}

export interface Playground {
  id: string;
  project_id: string;
  name: string;
  description?: string | null;
  config: Record<string, any>;
  created_at: number;
  updated_at: number;
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

// --- Function/Scorer types ---

export interface Function {
  id: string;
  project_id?: string | null;  // null = builtin/global
  name: string;
  display_name?: string | null;
  description?: string | null;
  type: 'scorer' | 'tool';
  runtime: 'builtin' | 'python' | 'llm_judge';
  config: Record<string, any>;
  code?: string | null;
  enabled: boolean;
  created_at: number;
}

// --- Collaboration primitives ---

export interface Attachment {
  id: string;
  org_id?: string | null;
  project_id?: string | null;
  object_type: string;
  object_id: string;
  kind: 'external' | 'internal' | string;
  url: string;
  content_type?: string | null;
  size_bytes?: number | null;
  label?: string | null;
  meta: Record<string, any>;
  created_at: number;
}

export interface Assignment {
  id: string;
  org_id?: string | null;
  project_id?: string | null;
  object_type: string;
  object_id: string;
  assignee: string;
  status: 'open' | 'resolved' | string;
  note?: string | null;
  created_at: number;
  updated_at: number;
}

export interface Mention {
  id: string;
  org_id?: string | null;
  project_id?: string | null;
  object_type: string;
  object_id: string;
  mentioned: string;
  note?: string | null;
  created_at: number;
}

export interface ShareLink {
  id: string;
  token: string;
  org_id?: string | null;
  project_id?: string | null;
  object_type: string;
  object_id: string;
  expires_at?: number | null;
  revoked_at?: number | null;
  created_at: number;
}

// --- Monitor charts ---

export interface MonitorChart {
  id: string;
  project_id: string;
  name: string;
  query: string;
  chart_type: 'line' | 'area' | 'bar' | string;
  x_field: string;
  y_field: string;
  series_field?: string | null;
  config: Record<string, any>;
  created_at: number;
  updated_at: number;
}

// --- Review queue ---

export interface ReviewItem {
  id: string;
  org_id?: string | null;
  project_id: string;
  source_type: string;
  source_id: string;
  status: 'open' | 'in_review' | 'resolved' | 'dismissed' | string;
  priority: number;
  labels: string[];
  score?: number | null;
  notes?: string | null;
  dataset_id?: string | null;
  dataset_row_id?: string | null;
  meta: Record<string, any>;
  created_at: number;
  updated_at: number;
  resolved_at?: number | null;
}

// --- Log types (first-class, separate from traces) ---

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
  attributes: Record<string, any>;
  log_metadata: Record<string, any>;
  created_at: number;
}

// --- AQL ---

export interface AqlQueryResponse {
  shape: string;
  schema: string[];
  data: Record<string, any>[];
  query?: string;
}

export interface AqlFilter {
  field: string;
  op: string;
  value: any;
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
  params?: Record<string, any>;
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
