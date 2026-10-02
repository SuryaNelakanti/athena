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
  config: Record<string, unknown>;
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
  meta: Record<string, unknown>;
  created_at: number;
  updated_at: number;
  resolved_at?: number | null;
}

export interface ReviewCreateInput {
  project_id: string;
  source_type: string;
  source_id: string;
  priority?: number;
  labels?: string[];
  notes?: string;
}

export interface ReviewFromTraceInput {
  trace_id: string;
  project_id?: string;
  priority?: number;
  labels?: string[];
  notes?: string;
}

export interface ReviewUpdateInput {
  status?: string;
  priority?: number;
  labels?: string[];
  score?: number;
  notes?: string;
  meta?: Record<string, unknown>;
}

export interface ReviewPromoteInput {
  dataset_id: string;
  corrected_expected?: Record<string, unknown>;
  example_type?: string;
  row_kind?: string;
  eval_label?: string;
}

// --- Log types (first-class, separate from traces) ---
