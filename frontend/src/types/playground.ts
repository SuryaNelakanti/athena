export interface Playground {
  id: string;
  project_id: string;
  name: string;
  description?: string | null;
  config: Record<string, unknown>;
  created_at: number;
  updated_at: number;
}

export interface PlaygroundRunEntry {
  id: string;
  playground_id: string;
  variant_id: string;
  variant: Record<string, unknown>;
  input: unknown;
  output: { text: string };
  scores: Record<string, unknown>;
  trace_id: string | null;
  created_at: number;
}

export interface PlaygroundRunResponse {
  playground_id: string;
  runs: PlaygroundRunEntry[];
}

export interface PlaygroundRunInput {
  variants?: Array<Record<string, unknown>>;
  input?: unknown;
  dataset_id?: string;
  trace?: boolean;
}

export interface PlaygroundPromoteInput {
  name?: string;
  dataset_id: string;
}
