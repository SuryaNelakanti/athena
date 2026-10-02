export interface Project {
  id: string;
  name: string;
  org_id: string;
}

export interface Organization {
  id: string;
  name: string;
  description?: string | null;
  created_at: number;
  updated_at: number;
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
  [key: string]: unknown;
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
  input: unknown;
  output: unknown;
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

export interface AgentSession {
  id: string;
  project_id: string;
  agent_name?: string | null;
  env?: string | null;
  status: string;
  tags: string[];
  metadata: Record<string, unknown>;
  created_at: number;
  updated_at: number;
  last_run_at?: number | null;
  run_count?: number;
  error_count?: number;
  total_cost?: number;
  total_latency?: number;
  total_tokens?: number;
  last_status?: string | null;
  last_run_id?: string | null;
}

export interface AgentRun {
  id: string;
  session_id: string;
  project_id: string;
  trace_id?: string | null;
  status: string;
  started_at: number;
  ended_at?: number | null;
  total_tokens?: number | null;
  total_cost?: number | null;
  total_latency?: number | null;
  tags: string[];
  metadata: Record<string, unknown>;
  created_at: number;
}

export interface RunReplay {
  id: string;
  project_id: string;
  source_run_id: string;
  replay_run_id: string;
  mode: string;
  status: string;
  summary: Record<string, unknown>;
  created_at: number;
}

export interface ReplayRunResult {
  replay: RunReplay;
  run: AgentRun;
}

export interface RunCompareNodeChange {
  node: string;
  latency_ms: number;
  status_changed: boolean;
  output_changed: boolean;
}

export interface RunCompareResult {
  baseline_run_id: string;
  candidate_run_id: string;
  summary: Record<string, unknown>;
  nodes_added: string[];
  nodes_removed: string[];
  nodes_changed: RunCompareNodeChange[];
}

export interface AgentSessionDetail {
  session: AgentSession;
  runs: AgentRun[];
}

export interface SessionEvent {
  id: string;
  session_id: string;
  run_id?: string | null;
  sequence: number;
  event_type: string;
  timestamp: number;
  payload: Record<string, unknown>;
}

export interface SessionAnnotation {
  id: string;
  session_id: string;
  project_id: string;
  labels: string[];
  severity?: string | null;
  owner?: string | null;
  status: string;
  note?: string | null;
  created_at: number;
  updated_at: number;
}

export interface SessionEval {
  id: string;
  session_id: string;
  project_id: string;
  run_id?: string | null;
  version: number;
  rubric: Record<string, unknown>;
  scorers: Array<Record<string, unknown>>;
  scores: Record<string, unknown>;
  summary: Record<string, unknown>;
  created_at: number;
}

export interface CausalChainNode {
  id: string;
  name: string;
  status: string;
}

export interface RunGraphNode {
  id: string;
  span_id: string;
  name: string;
  kind: string;
  status: string;
  start_time: number;
  end_time: number;
  duration_ms: number;
  depth: number;
  lane: number;
  parent_id?: string | null;
  retry_parent_id?: string | null;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  attributes: Record<string, unknown>;
  metrics: Record<string, unknown>;
  tags: string[];
  error_message?: string | null;
  causal_chain?: CausalChainNode[];
}

export interface RunGraphEdge {
  from_id: string;
  to_id: string;
  kind: string;
}

export interface RunGraph {
  run_id: string;
  trace_id: string;
  root_id: string;
  nodes: RunGraphNode[];
  edges: RunGraphEdge[];
  layout: Record<string, unknown>;
}
