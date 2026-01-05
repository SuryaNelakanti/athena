import { Log, Project, Span, SpanType, Trace } from '../../src/types';

const now = Date.now();

export const seedProject: Project = {
  id: 'proj_support',
  name: 'Refund Issues',
  org_id: 'org_octoworks',
};

const makeSpan = (overrides: Partial<Span>): Span => ({
  id: 'span_refund_root',
  trace_id: 'trace_refund_incident',
  parent_id: null,
  name: 'Support: Refund - Duplicate charge resolved [TCK-88421]',
  type: SpanType.LLM,
  start_time: now - 15 * 60 * 1000,
  end_time: now - 15 * 60 * 1000 + 620,
  status: 'success',
  input: { query: 'Customer charged twice for seat add-on' },
  output: { content: 'Apologized and issued refund per Section 4.1' },
  metrics: { latency_ms: 620, total_tokens: 1280, cost: 0.00052 },
  attributes: { model: 'gpt-4o-mini', provider: 'openai' },
  tags: ['support', 'refund', 'guardrail'],
  ...overrides,
});

const incidentSpan = makeSpan({});
const followupSpan = makeSpan({
  id: 'span_refund_followup',
  trace_id: 'trace_refund_followup',
  name: 'Support: Refund - Late cancellation (escalated) [TCK-88502]',
  status: 'error',
  metrics: { latency_ms: 880, total_tokens: 1740, cost: 0.0009 },
  tags: ['support', 'refund', 'compliance'],
});

export const seedTraces: Trace[] = [
  {
    id: 'trace_refund_incident',
    project_id: seedProject.id,
    parent_trace_id: null,
    trace_group_id: 'trace_group_refund',
    input_span_id: incidentSpan.id,
    output_span_id: incidentSpan.id,
    timestamp: incidentSpan.start_time,
    total_latency: incidentSpan.metrics.latency_ms,
    total_cost: incidentSpan.metrics.cost ?? 0,
    total_tokens: incidentSpan.metrics.total_tokens ?? 0,
    status: 'success',
    tags: ['support', 'refund'],
    root_span: incidentSpan,
    spans: [incidentSpan],
  },
  {
    id: 'trace_refund_followup',
    project_id: seedProject.id,
    parent_trace_id: 'trace_refund_incident',
    trace_group_id: 'trace_group_refund',
    input_span_id: followupSpan.id,
    output_span_id: followupSpan.id,
    timestamp: followupSpan.start_time,
    total_latency: followupSpan.metrics.latency_ms,
    total_cost: followupSpan.metrics.cost ?? 0,
    total_tokens: followupSpan.metrics.total_tokens ?? 0,
    status: 'error',
    tags: ['support', 'refund', 'escalation'],
    root_span: followupSpan,
    spans: [followupSpan],
  },
];

const baseLog = (overrides: Partial<Log>): Log => ({
  id: 'log_refund_duplicate',
  project_id: seedProject.id,
  trace_id: 'trace_refund_incident',
  span_id: incidentSpan.id,
  event_type: 'guardrail',
  status: 'success',
  message: 'Support: Refund - Duplicate charge resolved [TCK-88421]',
  timestamp: incidentSpan.start_time,
  latency_ms: incidentSpan.metrics.latency_ms,
  prompt_tokens: 640,
  completion_tokens: 640,
  total_tokens: incidentSpan.metrics.total_tokens,
  cost: incidentSpan.metrics.cost,
  model: incidentSpan.attributes.model,
  provider: incidentSpan.attributes.provider,
  attributes: { ...incidentSpan.attributes },
  log_metadata: { customer: 'Nexus Technologies' },
  created_at: incidentSpan.start_time,
  ...overrides,
});

export const seedLogs: Log[] = [
  baseLog({}),
  baseLog({
    id: 'log_refund_escalation',
    trace_id: 'trace_refund_followup',
    span_id: followupSpan.id,
    event_type: 'compliance',
    status: 'error',
    message: 'Support: Refund - Late cancellation (escalated) [TCK-88502]',
    timestamp: followupSpan.start_time,
    latency_ms: followupSpan.metrics.latency_ms,
    prompt_tokens: 870,
    completion_tokens: 870,
    total_tokens: followupSpan.metrics.total_tokens,
    cost: followupSpan.metrics.cost,
    log_metadata: { customer: 'Nexus Technologies', policy: 'policy_refunds_v3' },
  }),
];

export const seedViews = [
  {
    id: 'view_refund_errors',
    project_id: seedProject.id,
    name: 'Support Refund Errors',
    entity_type: 'logs',
    config: { filters: [{ field: 'status', op: '=', value: 'error' }] },
    created_at: now,
  },
];

export const seedQueries = {
  logs: `from project_logs(project_id="${seedProject.id}") select id, trace_id, status, event_type, message, latency_ms, total_tokens, cost, timestamp sort timestamp desc limit 200`,
};

export const childCounts = [{ parent_trace_id: 'trace_refund_incident', child_count: 1 }];
