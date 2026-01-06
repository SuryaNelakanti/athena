import {
  Log,
  Project,
  Span,
  SpanType,
  Trace,
  Dataset,
  DatasetRow,
  DatasetVersion,
  Experiment,
  ExperimentVersion,
  ExperimentRun,
  ExperimentRunResult,
  ReviewItem,
  MonitorChart,
  ModelRegistry,
  Function,
  Assignment,
  Mention,
  ShareLink,
} from '../../src/types';

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

const datasetCreatedAt = now - 3 * 24 * 60 * 60 * 1000;
const experimentCreatedAt = now - 2 * 24 * 60 * 60 * 1000;
const reviewCreatedAt = now - 6 * 60 * 60 * 1000;

export const seedDatasets: Dataset[] = [
  {
    id: 'ds_refund_eval',
    project_id: seedProject.id,
    name: 'Refund QA',
    description: 'Gold and anti-pattern refund examples.',
    version: 1,
    kind: 'eval',
    row_counts: { total: 2, eval: 2, resource: 0 },
    created_at: datasetCreatedAt,
  },
  {
    id: 'ds_refund_knowledge',
    project_id: seedProject.id,
    name: 'Refund Policy Knowledge',
    description: 'Reference policy excerpts for support agents.',
    version: 1,
    kind: 'knowledge',
    row_counts: { total: 1, eval: 0, resource: 1 },
    created_at: datasetCreatedAt + 15 * 60 * 1000,
  },
];

export const seedDatasetRows: DatasetRow[] = [
  {
    id: 'row_refund_gold_v1',
    dataset_id: 'ds_refund_eval',
    row_kind: 'eval',
    eval_label: 'gold',
    logical_id: 'row_refund_gold',
    version: 1,
    dataset_version: 1,
    is_deleted: false,
    input: { prompt: 'Customer charged twice for seat add-on.' },
    expected: { answer: 'Apologize and issue refund per refund policy.' },
    meta: { source: 'support', ticket: 'TCK-88421' },
    example_type: 'gold',
    source_trace_id: 'trace_refund_incident',
    created_at: datasetCreatedAt + 5 * 60 * 1000,
  },
  {
    id: 'row_refund_anti_v1',
    dataset_id: 'ds_refund_eval',
    row_kind: 'eval',
    eval_label: 'anti_pattern',
    logical_id: 'row_refund_anti',
    version: 1,
    dataset_version: 1,
    is_deleted: false,
    input: { prompt: 'Customer requests refund after late cancellation.' },
    expected: { answer: 'Avoid denying without citing policy; escalate.' },
    meta: { source: 'support', ticket: 'TCK-88502' },
    example_type: 'anti_pattern',
    source_trace_id: 'trace_refund_followup',
    created_at: datasetCreatedAt + 9 * 60 * 1000,
  },
  {
    id: 'row_policy_resource_v1',
    dataset_id: 'ds_refund_knowledge',
    row_kind: 'resource',
    logical_id: 'row_policy_resource',
    version: 1,
    dataset_version: 1,
    is_deleted: false,
    input: { text: 'Refund policy section 4.1: duplicate charges are refundable.' },
    expected: null,
    meta: { source: 'policy', policy_id: 'policy_refunds_v3' },
    created_at: datasetCreatedAt + 12 * 60 * 1000,
  },
];

export const seedDatasetHistory: DatasetVersion[] = [
  {
    id: 'dsv_refund_eval_1',
    dataset_id: 'ds_refund_eval',
    version: 1,
    action: 'insert',
    logical_id: 'row_refund_gold',
    row_id: 'row_refund_gold_v1',
    meta: { note: 'Seed gold example' },
    created_at: datasetCreatedAt + 5 * 60 * 1000,
  },
  {
    id: 'dsv_refund_eval_2',
    dataset_id: 'ds_refund_eval',
    version: 1,
    action: 'insert',
    logical_id: 'row_refund_anti',
    row_id: 'row_refund_anti_v1',
    meta: { note: 'Seed anti-pattern' },
    created_at: datasetCreatedAt + 9 * 60 * 1000,
  },
];

export const seedDatasetRowHistory: Record<string, DatasetRow[]> = {
  row_refund_gold: [seedDatasetRows[0]],
  row_refund_anti: [seedDatasetRows[1]],
};

export const seedExperiments: Experiment[] = [
  {
    id: 'exp_refund_quality',
    project_id: seedProject.id,
    dataset_id: 'ds_refund_eval',
    name: 'Refund Quality Eval',
    status: 'completed',
    summary: { avg_score: 0.86, main_version_id: 'exp_ver_1' },
    created_at: experimentCreatedAt,
  },
];

export const seedExperimentVersions: ExperimentVersion[] = [
  {
    id: 'exp_ver_1',
    experiment_id: 'exp_refund_quality',
    version_number: 1,
    parent_version_id: null,
    dataset_version_pinned: 1,
    config: {
      model: { registry_id: 'model_gpt4o' },
      task: { system_prompt: 'You are a support assistant focused on refunds.' },
      params: { temperature: 0.2, max_tokens: 512 },
      scorers: ['exact_match', 'contains'],
    },
    created_at: experimentCreatedAt + 15 * 60 * 1000,
  },
  {
    id: 'exp_ver_2',
    experiment_id: 'exp_refund_quality',
    version_number: 2,
    parent_version_id: 'exp_ver_1',
    dataset_version_pinned: 1,
    config: {
      model: { registry_id: 'model_gpt4o' },
      task: { system_prompt: 'Be concise and cite policy IDs.' },
      params: { temperature: 0.3, max_tokens: 512 },
      scorers: ['exact_match', 'contains', 'llm_judge'],
    },
    created_at: experimentCreatedAt + 2 * 60 * 60 * 1000,
  },
];

export const seedExperimentRuns: ExperimentRun[] = [
  {
    id: 'run_refund_v1a',
    experiment_version_id: 'exp_ver_1',
    status: 'completed',
    summary: { avg_score: 0.82, rows_total: 2, rows_done: 2 },
    created_at: experimentCreatedAt + 2 * 60 * 60 * 1000,
    started_at: experimentCreatedAt + 2 * 60 * 60 * 1000,
    completed_at: experimentCreatedAt + 2 * 60 * 60 * 1000 + 45 * 1000,
  },
  {
    id: 'run_refund_v1b',
    experiment_version_id: 'exp_ver_1',
    status: 'completed',
    summary: { avg_score: 0.88, rows_total: 2, rows_done: 2 },
    created_at: experimentCreatedAt + 3 * 60 * 60 * 1000,
    started_at: experimentCreatedAt + 3 * 60 * 60 * 1000,
    completed_at: experimentCreatedAt + 3 * 60 * 60 * 1000 + 50 * 1000,
  },
];

export const seedExperimentRunResults: ExperimentRunResult[] = [
  {
    id: 'res_refund_v1a_row1',
    run_id: 'run_refund_v1a',
    dataset_row_id: 'row_refund_gold_v1',
    output: { content: 'Issued refund and apologized per Section 4.1.' },
    scores: { exact_match: 0.8, contains: 1.0 },
    latency_ms: 420,
    created_at: experimentCreatedAt + 2 * 60 * 60 * 1000 + 20 * 1000,
  },
  {
    id: 'res_refund_v1a_row2',
    run_id: 'run_refund_v1a',
    dataset_row_id: 'row_refund_anti_v1',
    output: { content: 'Escalated with policy reference.' },
    scores: { exact_match: 0.84, contains: 0.9 },
    latency_ms: 480,
    created_at: experimentCreatedAt + 2 * 60 * 60 * 1000 + 30 * 1000,
  },
  {
    id: 'res_refund_v1b_row1',
    run_id: 'run_refund_v1b',
    dataset_row_id: 'row_refund_gold_v1',
    output: { content: 'Refund granted. Refer to policy_refunds_v3.' },
    scores: { exact_match: 0.9, contains: 1.0 },
    latency_ms: 410,
    created_at: experimentCreatedAt + 3 * 60 * 60 * 1000 + 20 * 1000,
  },
  {
    id: 'res_refund_v1b_row2',
    run_id: 'run_refund_v1b',
    dataset_row_id: 'row_refund_anti_v1',
    output: { content: 'Escalated with refund policy citation.' },
    scores: { exact_match: 0.86, contains: 0.95 },
    latency_ms: 470,
    created_at: experimentCreatedAt + 3 * 60 * 60 * 1000 + 30 * 1000,
  },
];

export const seedModels: ModelRegistry[] = [
  {
    id: 'model_gpt4o',
    provider: 'openai',
    model_id: 'gpt-4o-mini',
    display_name: 'GPT-4o Mini',
    enabled: true,
    created_at: now - 7 * 24 * 60 * 60 * 1000,
  },
];

export const seedScorers: Function[] = [
  {
    id: 'scorer_exact_match',
    project_id: null,
    name: 'exact_match',
    display_name: 'Exact Match',
    description: 'Checks if output matches the expected answer.',
    type: 'scorer',
    runtime: 'builtin',
    config: { case_sensitive: false, normalize_whitespace: true },
    enabled: true,
    created_at: now - 10 * 24 * 60 * 60 * 1000,
  },
  {
    id: 'scorer_contains',
    project_id: null,
    name: 'contains',
    display_name: 'Contains',
    description: 'Checks if expected text appears in the output.',
    type: 'scorer',
    runtime: 'builtin',
    config: { case_sensitive: false },
    enabled: true,
    created_at: now - 9 * 24 * 60 * 60 * 1000,
  },
  {
    id: 'scorer_llm_judge',
    project_id: null,
    name: 'llm_judge',
    display_name: 'LLM Judge',
    description: 'Evaluates quality on a 1-5 scale.',
    type: 'scorer',
    runtime: 'llm_judge',
    config: { model: 'gpt-4o-mini', provider: 'openai' },
    enabled: true,
    created_at: now - 8 * 24 * 60 * 60 * 1000,
  },
];

export const seedReviews: ReviewItem[] = [
  {
    id: 'review_refund_escalation',
    project_id: seedProject.id,
    source_type: 'trace',
    source_id: 'trace_refund_followup',
    status: 'open',
    priority: 2,
    labels: ['refund', 'escalation'],
    score: 0.42,
    notes: 'Needs policy citation.',
    meta: {
      input_preview: 'Customer requests refund after late cancellation.',
      output_preview: 'Denied refund without citing policy.',
    },
    created_at: reviewCreatedAt,
    updated_at: reviewCreatedAt,
  },
  {
    id: 'review_refund_duplicate',
    project_id: seedProject.id,
    source_type: 'trace',
    source_id: 'trace_refund_incident',
    status: 'open',
    priority: 1,
    labels: ['refund', 'gold'],
    score: 0.9,
    notes: '',
    meta: {
      input_preview: 'Customer charged twice for seat add-on.',
      output_preview: 'Issued refund and apology.',
    },
    created_at: reviewCreatedAt + 15 * 60 * 1000,
    updated_at: reviewCreatedAt + 15 * 60 * 1000,
  },
];

export const seedCharts: MonitorChart[] = [];

export const seedAssignments: Assignment[] = [
  {
    id: 'assign_refund_1',
    project_id: seedProject.id,
    object_type: 'trace',
    object_id: 'trace_refund_followup',
    assignee: 'ops@octoworks.ai',
    status: 'open',
    note: 'Investigate escalation logic.',
    created_at: reviewCreatedAt,
    updated_at: reviewCreatedAt,
  },
];

export const seedMentions: Mention[] = [
  {
    id: 'mention_refund_1',
    project_id: seedProject.id,
    object_type: 'trace',
    object_id: 'trace_refund_incident',
    mentioned: 'pm@octoworks.ai',
    note: 'Share this gold example with PM.',
    created_at: reviewCreatedAt + 5 * 60 * 1000,
  },
];

export const seedShareLinks: ShareLink[] = [
  {
    id: 'share_refund_trace',
    token: 'share_refund_trace',
    project_id: seedProject.id,
    object_type: 'trace',
    object_id: 'trace_refund_followup',
    created_at: reviewCreatedAt + 2 * 60 * 60 * 1000,
  },
];
