export interface ModelRegistryCreateInput {
  provider: string;
  model_id: string;
  display_name?: string;
  enabled?: boolean;
}

export interface ModelRegistryUpdateInput {
  enabled?: boolean;
  display_name?: string;
}

export interface ModelRegistrySyncInput {
  provider?: string;
  enable_new?: boolean;
}

export type ProviderId = 'openai' | 'anthropic' | 'gemini' | 'groq' | 'mock';

export interface ProviderKeyStatus {
  provider: ProviderId;
  configured: boolean;
  updated_at_ms?: number | null;
  api_key_last4?: string | null;
  durable?: boolean;
  scope?: { org_id: string | null; project_id: string | null };
  org_id?: string | null;
  project_id?: string | null;
}

export interface Guardrail {
  id: string;
  project_id: string;
  name: string;
  description?: string | null;
  action: string;
  condition_type: string;
  condition_config: Record<string, unknown>;
  enabled: boolean;
  priority: number;
  created_at: number;
}

export interface GuardrailCreateInput {
  id?: string;
  project_id: string;
  name: string;
  description?: string;
  action?: string;
  condition_type?: string;
  condition_config?: Record<string, unknown>;
  enabled?: boolean;
  priority?: number;
  created_at?: number;
}

export interface GuardrailUpdateInput {
  enabled?: boolean;
  action?: string;
}

export interface SpanFeedback {
  id: string;
  project_id: string;
  trace_id: string;
  span_id: string;
  feedback_type: string;
  value: unknown;
  comment?: string | null;
  labels: string[];
  metadata_: Record<string, unknown>;
  created_at: number;
}

export interface SpanFeedbackCreateInput {
  feedback_type?: string;
  value?: unknown;
  comment?: string;
  labels?: string[];
  metadata?: Record<string, unknown>;
}

export interface SpanScore {
  id: string;
  project_id: string;
  trace_id: string;
  span_id: string;
  name: string;
  score?: number | null;
  passed?: boolean | null;
  reasoning?: string | null;
  metadata_: Record<string, unknown>;
  created_at: number;
  updated_at: number;
}

export interface SpanScoreCreateInput {
  name: string;
  score?: number;
  passed?: boolean;
  reasoning?: string;
  metadata?: Record<string, unknown>;
}

export interface AutomationRule {
  id: string;
  project_id: string;
  name: string;
  enabled: boolean;
  trigger: Record<string, unknown>;
  actions: Array<Record<string, unknown>>;
  created_at: number;
  updated_at: number;
}

export interface AutomationRuleCreateInput {
  project_id: string;
  name: string;
  enabled?: boolean;
  trigger: Record<string, unknown>;
  actions: Array<Record<string, unknown>>;
}

export interface AutomationRun {
  id: string;
  rule_id: string;
  project_id: string;
  source_type: string;
  source_id: string;
  status: string;
  trigger_snapshot: Record<string, unknown>;
  action_results: Array<Record<string, unknown>>;
  created_at: number;
}

export interface RemoteEval {
  id: string;
  project_id: string;
  name: string;
  endpoint_url: string;
  auth: Record<string, unknown>;
  config: Record<string, unknown>;
  created_at: number;
  updated_at: number;
}

export interface RemoteEvalRegisterInput {
  project_id: string;
  name: string;
  endpoint_url: string;
  auth?: Record<string, unknown>;
  config?: Record<string, unknown>;
}

export interface RemoteEvalInvokeInput {
  input?: unknown;
  expected?: unknown;
  context?: Record<string, unknown>;
  dry_run?: boolean;
}

export interface RemoteEvalDryRunResult {
  status: 'dry_run';
  remote_eval_id: string;
  request: {
    input: unknown;
    expected: unknown;
    context: Record<string, unknown>;
    config: Record<string, unknown>;
  };
}

export interface RemoteEvalCompletedResult {
  status: 'completed';
  remote_eval_id: string;
  result: unknown;
}

export type RemoteEvalInvokeResult = RemoteEvalDryRunResult | RemoteEvalCompletedResult;
