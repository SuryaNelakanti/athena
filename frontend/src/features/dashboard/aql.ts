import type { AqlBuilder } from '../../types';

// Field options for chart axis selectors
export const X_AXIS_FIELDS = [
    { value: 'timestamp', label: 'Timestamp' },
    { value: 'model', label: 'Model' },
    { value: 'provider', label: 'Provider' },
    { value: 'status', label: 'Status' },
    { value: 'event_type', label: 'Event Type' },
];

export const Y_AXIS_FIELDS = [
    { value: 'total_tokens', label: 'Total Tokens' },
    { value: 'latency_ms', label: 'Latency (ms)' },
    { value: 'cost', label: 'Cost' },
    { value: 'prompt_tokens', label: 'Prompt Tokens' },
    { value: 'completion_tokens', label: 'Completion Tokens' },
    { value: 'count', label: 'Count' },
];

export const SERIES_FIELDS = [
    { value: '', label: 'None' },
    { value: 'model', label: 'Model' },
    { value: 'provider', label: 'Provider' },
    { value: 'status', label: 'Status' },
    { value: 'event_type', label: 'Event Type' },
];

export const GUIDED_METRICS = [
    {
        id: 'count',
        label: 'Request count',
        func: 'count',
        field: '*',
        alias: 'count',
        description: 'Number of log events in the window.',
    },
    {
        id: 'total_tokens',
        label: 'Total tokens',
        func: 'sum',
        field: 'total_tokens',
        alias: 'total_tokens',
        description: 'Sum of tokens generated.',
    },
    {
        id: 'avg_latency',
        label: 'Average latency',
        func: 'avg',
        field: 'latency_ms',
        alias: 'avg_latency',
        description: 'Average response time in milliseconds.',
    },
    {
        id: 'p95_latency',
        label: 'P95 latency',
        func: 'p95',
        field: 'latency_ms',
        alias: 'p95_latency',
        description: '95th percentile response time.',
    },
    {
        id: 'total_cost',
        label: 'Total cost',
        func: 'sum',
        field: 'cost',
        alias: 'total_cost',
        description: 'Estimated cost in USD.',
    },
];

export const GUIDED_TIME_RANGES = [
    { id: '24h', label: 'Last 24 hours', ms: 24 * 60 * 60 * 1000 },
    { id: '7d', label: 'Last 7 days', ms: 7 * 24 * 60 * 60 * 1000 },
    { id: '30d', label: 'Last 30 days', ms: 30 * 24 * 60 * 60 * 1000 },
    { id: 'all', label: 'All time', ms: null },
];

export const GUIDED_AXIS_FIELDS = [
    { value: 'timestamp', label: 'Time' },
    { value: 'model', label: 'Model' },
    { value: 'provider', label: 'Provider' },
    { value: 'status', label: 'Status' },
    { value: 'event_type', label: 'Event Type' },
];

export const GUIDED_BREAKDOWN_FIELDS = [
    { value: '', label: 'None' },
    { value: 'model', label: 'Model' },
    { value: 'provider', label: 'Provider' },
    { value: 'status', label: 'Status' },
    { value: 'event_type', label: 'Event Type' },
];

export const GUIDED_STATUS_FILTERS = [
    { value: 'all', label: 'All statuses' },
    { value: 'success', label: 'Success only' },
    { value: 'error', label: 'Errors only' },
];

export const GUIDED_PROVIDER_FILTERS = [
    { value: 'all', label: 'All providers' },
    { value: 'openai', label: 'OpenAI' },
    { value: 'anthropic', label: 'Anthropic' },
    { value: 'gemini', label: 'Gemini' },
    { value: 'mock', label: 'Mock' },
];

export const GUIDED_DEFAULTS = {
    metric: 'count',
    timeRange: '24h',
    xAxis: 'timestamp',
    breakdown: '',
    statusFilter: 'all',
    providerFilter: 'all',
    limit: 200,
};

export type GuidedChartConfig = typeof GUIDED_DEFAULTS;

export type ChartMode = 'guided' | 'advanced';

export interface ChartDraft {
    name: string;
    query: string;
    chart_type: string;
    x_field: string;
    y_field: string;
    series_field: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

export const parseGuidedConfig = (value: unknown): Partial<GuidedChartConfig> => {
    if (!isRecord(value)) return {};

    const parsed: Partial<GuidedChartConfig> = {};
    if (typeof value.metric === 'string' && GUIDED_METRICS.some((metric) => metric.id === value.metric)) {
        parsed.metric = value.metric;
    }
    if (typeof value.timeRange === 'string' && GUIDED_TIME_RANGES.some((range) => range.id === value.timeRange)) {
        parsed.timeRange = value.timeRange;
    }
    if (typeof value.xAxis === 'string' && GUIDED_AXIS_FIELDS.some((field) => field.value === value.xAxis)) {
        parsed.xAxis = value.xAxis;
    }
    if (typeof value.breakdown === 'string' && GUIDED_BREAKDOWN_FIELDS.some((field) => field.value === value.breakdown)) {
        parsed.breakdown = value.breakdown;
    }
    if (typeof value.statusFilter === 'string' && GUIDED_STATUS_FILTERS.some((filter) => filter.value === value.statusFilter)) {
        parsed.statusFilter = value.statusFilter;
    }
    if (typeof value.providerFilter === 'string' && GUIDED_PROVIDER_FILTERS.some((filter) => filter.value === value.providerFilter)) {
        parsed.providerFilter = value.providerFilter;
    }
    if (typeof value.limit === 'number' && Number.isSafeInteger(value.limit) && value.limit > 0) {
        parsed.limit = value.limit;
    }
    return parsed;
};

interface ChartTemplate {
    id: string;
    name: string;
    description: string;
    chart_type: string;
    guided: GuidedChartConfig;
}

export const CHART_TEMPLATES: ChartTemplate[] = [
    {
        id: 'tokens_over_time',
        name: 'Token usage over time',
        description: 'Track total tokens with a provider split.',
        chart_type: 'area',
        guided: {
            metric: 'total_tokens',
            timeRange: '24h',
            xAxis: 'timestamp',
            breakdown: 'provider',
            statusFilter: 'all',
            providerFilter: 'all',
            limit: 200,
        },
    },
    {
        id: 'error_rate',
        name: 'Errors by model',
        description: 'Surface failure volume by model.',
        chart_type: 'bar',
        guided: {
            metric: 'count',
            timeRange: '7d',
            xAxis: 'model',
            breakdown: '',
            statusFilter: 'error',
            providerFilter: 'all',
            limit: 200,
        },
    },
    {
        id: 'latency_p95',
        name: 'P95 latency trend',
        description: 'Watch tail latency across the last 24h.',
        chart_type: 'line',
        guided: {
            metric: 'p95_latency',
            timeRange: '24h',
            xAxis: 'timestamp',
            breakdown: 'model',
            statusFilter: 'all',
            providerFilter: 'all',
            limit: 200,
        },
    },
];

// Simple AQL formatter that adds line breaks and indentation
export const formatAql = (query: string): string => {
    if (!query.trim()) return query;
    // Add line breaks after keywords
    const formatted = query.trim()
        .replace(/\s+/g, ' ')
        .replace(/\b(from|select|filter|dimensions|measures|sort|limit)\b/gi, '\n$1')
        .trim();
    // Indent lines after the first
    const lines = formatted.split('\n');
    return lines.map((line, i) => i === 0 ? line : '  ' + line.trim()).join('\n');
};

export const formatAqlLiteral = (value: unknown): string => {
    if (value === null || value === undefined) return '""';
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (Array.isArray(value)) {
        const items = value.map((item) => formatAqlLiteral(item));
        return `(${items.join(', ')})`;
    }
    const raw = String(value).trim();
    if (!raw) return '""';
    if (raw.toLowerCase().startsWith('now()')) return raw;
    const escaped = raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `"${escaped}"`;
};

export const buildAqlFromBuilder = (builder: AqlBuilder): string => {
    const parts: string[] = [];
    const params = builder.params || {};
    const paramKeys = Object.keys(params).sort();
    const paramClause = paramKeys.length
        ? `(${paramKeys.map((key) => `${key}=${formatAqlLiteral(params[key])}`).join(', ')})`
        : '';
    parts.push(`from ${builder.shape}${paramClause}`);

    if (builder.select && builder.select.length) {
        parts.push(`select ${builder.select.join(', ')}`);
    } else if (!builder.dimensions?.length && !builder.measures?.length) {
        parts.push('select *');
    }

    if (builder.filters && builder.filters.length) {
        const filterClause = builder.filters
            .map((f) => `${f.field} ${f.op} ${formatAqlLiteral(f.value)}`)
            .join(' and ');
        parts.push(`filter ${filterClause}`);
    }

    if (builder.dimensions && builder.dimensions.length) {
        parts.push(`dimensions ${builder.dimensions.join(', ')}`);
    }

    if (builder.measures && builder.measures.length) {
        const measures = builder.measures.map((m) => {
            const field = m.field && m.field.length ? m.field : '*';
            const alias = m.alias ? ` as ${m.alias}` : '';
            return `${m.func}(${field})${alias}`;
        });
        parts.push(`measures ${measures.join(', ')}`);
    }

    if (builder.sort?.field) {
        parts.push(`sort ${builder.sort.field} ${(builder.sort.direction || 'asc').toLowerCase()}`);
    }

    if (builder.limit !== undefined && builder.limit !== null) {
        parts.push(`limit ${builder.limit}`);
    }

    return parts.join(' ');
};
