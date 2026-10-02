export interface Experiment {
  id: string;
  project_id: string;
  dataset_id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  summary: ExperimentSummary;
  created_at: number;
}

export interface ExperimentSummary {
  main_version_id?: string;
  avg_score?: number;
  weighted_avg_score?: number;
  [key: string]: unknown;
}

export interface ExperimentCreateInput {
  id?: string;
  project_id: string;
  dataset_id: string;
  name: string;
  status?: Experiment['status'];
  summary?: Record<string, unknown>;
  created_at?: number;
}

export interface RunExperimentInput {
  model: string;
  provider?: string;
  temperature?: number;
  max_tokens?: number;
  system_prompt?: string;
  clear_existing?: boolean;
}

export interface ExperimentResult {
  id: string;
  experiment_id: string;
  dataset_row_id: string;
  output: unknown;
  scores: Record<string, unknown>;
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
  config: ExperimentVersionConfig;
  created_at: number;
}

export interface ExperimentVersionConfig {
  task?: {
    type?: string;
    input_mode?: string;
    system_prompt?: string;
    prompt_template?: string;
    [key: string]: unknown;
  };
  model?: {
    registry_id?: string;
    provider?: string;
    id?: string;
    temperature?: number;
    max_tokens?: number | null;
    top_p?: number | null;
    frequency_penalty?: number | null;
    presence_penalty?: number | null;
    stop_sequences?: string[] | null;
    reasoning_effort?: string | null;
    json_mode?: boolean | null;
    seed?: number | null;
    [key: string]: unknown;
  };
  scorers?: Array<ScorerConfig | string>;
  notes?: string;
  source?: string;
  playground_id?: string;
  [key: string]: unknown;
}

export interface ExperimentVersionCreateInput {
  parent_version_id?: string;
  model_registry_id: string;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop_sequences?: string[];
  system_prompt?: string;
  prompt_template?: string;
  reasoning_effort?: string;
  json_mode?: boolean;
  seed?: number;
  scorers?: ScorerConfig[];
  notes?: string;
}

export interface ScorerConfig {
  type: string;
  weight?: number;
  threshold?: number;
  is_primary?: boolean;
  [key: string]: unknown;
}

export interface ExperimentRun {
  id: string;
  experiment_version_id: string;
  status: 'queued' | 'running' | 'completed' | 'error' | 'canceled' | string;
  summary: Record<string, unknown>;
  created_at: number;
  started_at?: number | null;
  completed_at?: number | null;
  cancel_requested_at?: number | null;
}

export interface ExperimentRunResult {
  id: string;
  run_id: string;
  dataset_row_id: string;
  output: unknown;
  scores: Record<string, unknown>;
  latency_ms: number;
  created_at: number;
}

export interface ExperimentComparisonSide {
  scores: Record<string, unknown>;
  output: Record<string, unknown> | null;
  output_text: string | null;
  trace_id: string | null;
  latency_ms: number | null;
}

export interface ScorerComparisonSummary {
  baseline: number | null;
  candidate: number | null;
  delta: number | null;
}

export interface ExperimentComparisonDeltaSummary {
  improved_count: number;
  regressed_count: number;
  unchanged_count: number;
  per_scorer: Record<string, ScorerComparisonSummary>;
  [metric: string]: number | Record<string, ScorerComparisonSummary>;
}

export interface ExperimentComparisonRow {
  dataset_row_id: string;
  logical_id: string | null;
  input: Record<string, unknown> | null;
  expected: Record<string, unknown> | null;
  baseline: ExperimentComparisonSide;
  candidate: ExperimentComparisonSide;
  delta_scores: Record<string, number>;
  status: 'improved' | 'regressed' | 'unchanged';
}

export interface ExperimentComparisonResult {
  baseline_run: ExperimentRun;
  candidate_run: ExperimentRun;
  primary_scorer: string;
  delta_summary: ExperimentComparisonDeltaSummary;
  rows: ExperimentComparisonRow[];
}
