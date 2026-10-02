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
  meta: Record<string, unknown>;
  created_at: number;
}

export interface AttachmentCreateInput {
  org_id?: string;
  project_id?: string;
  object_type: string;
  object_id: string;
  kind?: string;
  url: string;
  content_type?: string;
  size_bytes?: number;
  label?: string;
  meta?: Record<string, unknown>;
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

export interface AssignmentCreateInput {
  org_id?: string;
  project_id?: string;
  object_type: string;
  object_id: string;
  assignee: string;
  status?: string;
  note?: string;
}

export interface AssignmentUpdateInput {
  assignee?: string;
  status?: string;
  note?: string;
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

export interface MentionCreateInput {
  org_id?: string;
  project_id?: string;
  object_type: string;
  object_id: string;
  mentioned: string;
  note?: string;
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

export interface ShareLinkCreateInput {
  org_id?: string;
  project_id?: string;
  object_type: string;
  object_id: string;
  expires_at?: number;
}

export interface DeleteResult {
  status: 'deleted';
  id: string;
}

export interface SeedBuiltinScorersResult {
  created: string[];
  skipped: string[];
}
