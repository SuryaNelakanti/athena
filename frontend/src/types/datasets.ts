export interface Dataset {
  id: string;
  project_id: string;
  name: string;
  description?: string;
  version: number;
  kind?: 'eval' | 'knowledge' | 'mixed' | string;
  schema?: Record<string, unknown>;
  schema_version?: number;
  review_policy?: Record<string, unknown>;
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
  input: unknown;
  expected?: unknown;
  meta: Record<string, unknown>;
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
  meta: Record<string, unknown>;
  created_at: number;
}
