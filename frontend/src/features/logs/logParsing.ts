import type { Log } from '../../types';

type AqlRow = Record<string, unknown>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const optionalString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const optionalNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

export const parseAqlLogRow = (row: AqlRow, fallbackProjectId: string): Log | null => {
  const id = optionalString(row.id);
  const message = optionalString(row.message);
  const timestamp = optionalNumber(row.timestamp);
  if (!id || message === undefined || timestamp === undefined) return null;

  const level = optionalString(row.level);
  const status = optionalString(row.status) || (level === 'ERROR' ? 'error' : level ? 'success' : undefined);

  return {
    id,
    project_id: optionalString(row.project_id) || fallbackProjectId,
    trace_id: optionalString(row.trace_id),
    span_id: optionalString(row.span_id),
    level,
    status,
    event_type: optionalString(row.event_type),
    message,
    timestamp,
    latency_ms: optionalNumber(row.latency_ms),
    prompt_tokens: optionalNumber(row.prompt_tokens),
    completion_tokens: optionalNumber(row.completion_tokens),
    total_tokens: optionalNumber(row.total_tokens),
    cost: optionalNumber(row.cost),
    model: optionalString(row.model),
    provider: optionalString(row.provider),
    attributes: isRecord(row.attributes) ? row.attributes : {},
    log_metadata: isRecord(row.log_metadata) ? row.log_metadata : {},
    created_at: optionalNumber(row.created_at) || timestamp,
  };
};
