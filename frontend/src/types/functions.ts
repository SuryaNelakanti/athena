// --- Function/Scorer types ---

export interface Function {
  id: string;
  project_id?: string | null;  // null = builtin/global
  name: string;
  display_name?: string | null;
  description?: string | null;
  type: 'scorer' | 'tool';
  runtime: 'builtin' | 'python' | 'llm_judge';
  config: Record<string, unknown>;
  code?: string | null;
  enabled: boolean;
  created_at: number;
}

export interface FunctionCreateInput {
  name: string;
  display_name?: string;
  description?: string;
  type?: Function['type'];
  runtime?: Function['runtime'];
  config?: Record<string, unknown>;
  code?: string;
  enabled?: boolean;
}

export interface FunctionUpdateInput {
  display_name?: string;
  description?: string;
  config?: Record<string, unknown>;
  code?: string;
  enabled?: boolean;
}
