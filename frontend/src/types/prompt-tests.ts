export interface PromptTest {
  id: string;
  project_id: string;
  dataset_id: string;
  name?: string | null;
  prompt_config: Record<string, unknown>;
  success_criteria: Array<Record<string, unknown>>;
  status: 'pending' | 'running' | 'completed' | 'error' | 'canceled' | string;
  summary: Record<string, unknown>;
  created_at: number;
  updated_at: number;
  started_at?: number | null;
  completed_at?: number | null;
}

export interface PromptTestResult {
  id: string;
  prompt_test_id: string;
  dataset_row_id: string;
  output: unknown;
  scores: Record<string, unknown>;
  latency_ms: number;
  error?: string | null;
  created_at: number;
}
