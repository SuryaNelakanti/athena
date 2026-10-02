export type Filter = {
  id: string;
  field: string;
  op: string;
  value: string;
};

export const RESULT_LIMIT = 200;

export const FIELD_TYPES: Record<string, 'string' | 'number'> = {
  id: 'string',
  trace_id: 'string',
  span_id: 'string',
  status: 'string',
  event_type: 'string',
  message: 'string',
  model: 'string',
  provider: 'string',
  timestamp: 'number',
  latency_ms: 'number',
  prompt_tokens: 'number',
  completion_tokens: 'number',
  total_tokens: 'number',
  cost: 'number',
  created_at: 'number',
};

export const FIELD_LABELS: Record<string, string> = {
  status: 'Status',
  event_type: 'Event Type',
  message: 'Message',
  model: 'Model',
  provider: 'Provider',
  trace_id: 'Trace ID',
  span_id: 'Span ID',
  latency_ms: 'Latency (ms)',
  total_tokens: 'Total Tokens',
  cost: 'Cost',
  timestamp: 'Timestamp (ms)',
  prompt_tokens: 'Prompt Tokens',
  completion_tokens: 'Completion Tokens',
  created_at: 'Created At (ms)',
};

export const OP_BY_TYPE: Record<'string' | 'number', string[]> = {
  string: ['=', '!=', 'contains', 'not contains', 'regex', 'in'],
  number: ['=', '!=', '>', '>=', '<', '<='],
};

export const OP_LABELS: Record<string, string> = {
  '=': 'equals',
  '!=': 'not equals',
  'contains': 'contains',
  'not contains': 'not contains',
  'regex': 'matches regex',
  'in': 'in list',
  '>': 'greater than',
  '>=': 'greater or equal',
  '<': 'less than',
  '<=': 'less or equal',
};

export const FILTER_FIELDS = [
  'status',
  'event_type',
  'message',
  'model',
  'provider',
  'trace_id',
  'span_id',
  'latency_ms',
  'total_tokens',
  'cost',
  'timestamp',
  'prompt_tokens',
  'completion_tokens',
  'created_at',
];

export const FILTER_FIELD_GROUPS = [
  { label: 'Core', fields: ['status', 'event_type', 'message', 'model', 'provider'] },
  { label: 'Identifiers', fields: ['trace_id', 'span_id'] },
  { label: 'Timing', fields: ['timestamp', 'latency_ms', 'created_at'] },
  { label: 'Tokens', fields: ['total_tokens', 'prompt_tokens', 'completion_tokens'] },
  { label: 'Cost', fields: ['cost'] },
];

export const QUICK_FILTERS = [
  { label: 'Errors', field: 'status', op: '=', value: 'error' },
  { label: 'Compliance', field: 'event_type', op: '=', value: 'compliance' },
  { label: 'Guardrails', field: 'event_type', op: '=', value: 'guardrail' },
  { label: 'Alerts', field: 'event_type', op: '=', value: 'alert' },
  { label: 'Slow > 1500ms', field: 'latency_ms', op: '>', value: '1500' },
  { label: 'Cost > $0.01', field: 'cost', op: '>', value: '0.01' },
  { label: 'Tokens > 2k', field: 'total_tokens', op: '>', value: '2000' },
];

export const TIME_RANGES = [
  { label: 'All Time', value: 'all', ms: null },
  { label: 'Last 1h', value: '1h', ms: 60 * 60 * 1000 },
  { label: 'Last 24h', value: '24h', ms: 24 * 60 * 60 * 1000 },
  { label: 'Last 7d', value: '7d', ms: 7 * 24 * 60 * 60 * 1000 },
  { label: 'Custom', value: 'custom', ms: null },
];

export const EVENT_TYPE_PRESETS = [
  'llm_call',
  'llm_stream',
  'compliance',
  'guardrail',
  'audit',
  'alert',
  'custom',
];

export const makeId = () => `f_${Math.random().toString(36).slice(2, 9)}`;
export const normalizeViewFilters = (filters: Filter[]) => {
  return filters.flatMap((filter) => {
    if (filter.field === 'level' && filter.op === '=') {
      const status = filter.value?.toUpperCase() === 'ERROR' ? 'error' : 'success';
      return [{ ...filter, field: 'status', value: status }];
    }
    return [filter];
  });
};
