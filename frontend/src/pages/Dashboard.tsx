import React, { useEffect, useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, LineChart, Line } from 'recharts';
import { ChartBarIcon, ClockIcon, CurrencyDollarIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { api } from '../lib/api';
import { AqlBuilder, MonitorChart } from '../types';
import { Badge, Button, Card, Input, SectionHeader, Select, Tabs, Textarea } from '../components/ui';
import { PageHeader } from '../layouts/PageHeader';

interface DashboardProps {
    projectId: string;
}

type LogRow = {
    timestamp?: number;
    latency_ms?: number | null;
    cost?: number | null;
    status?: string;
};

// Field options for chart axis selectors
const X_AXIS_FIELDS = [
    { value: 'timestamp', label: 'Timestamp' },
    { value: 'model', label: 'Model' },
    { value: 'provider', label: 'Provider' },
    { value: 'status', label: 'Status' },
    { value: 'event_type', label: 'Event Type' },
];

const Y_AXIS_FIELDS = [
    { value: 'total_tokens', label: 'Total Tokens' },
    { value: 'latency_ms', label: 'Latency (ms)' },
    { value: 'cost', label: 'Cost' },
    { value: 'prompt_tokens', label: 'Prompt Tokens' },
    { value: 'completion_tokens', label: 'Completion Tokens' },
    { value: 'count', label: 'Count' },
];

const SERIES_FIELDS = [
    { value: '', label: 'None' },
    { value: 'model', label: 'Model' },
    { value: 'provider', label: 'Provider' },
    { value: 'status', label: 'Status' },
    { value: 'event_type', label: 'Event Type' },
];

const GUIDED_METRICS = [
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

const GUIDED_TIME_RANGES = [
    { id: '24h', label: 'Last 24 hours', ms: 24 * 60 * 60 * 1000 },
    { id: '7d', label: 'Last 7 days', ms: 7 * 24 * 60 * 60 * 1000 },
    { id: '30d', label: 'Last 30 days', ms: 30 * 24 * 60 * 60 * 1000 },
    { id: 'all', label: 'All time', ms: null },
];

const GUIDED_AXIS_FIELDS = [
    { value: 'timestamp', label: 'Time' },
    { value: 'model', label: 'Model' },
    { value: 'provider', label: 'Provider' },
    { value: 'status', label: 'Status' },
    { value: 'event_type', label: 'Event Type' },
];

const GUIDED_BREAKDOWN_FIELDS = [
    { value: '', label: 'None' },
    { value: 'model', label: 'Model' },
    { value: 'provider', label: 'Provider' },
    { value: 'status', label: 'Status' },
    { value: 'event_type', label: 'Event Type' },
];

const GUIDED_STATUS_FILTERS = [
    { value: 'all', label: 'All statuses' },
    { value: 'success', label: 'Success only' },
    { value: 'error', label: 'Errors only' },
];

const GUIDED_PROVIDER_FILTERS = [
    { value: 'all', label: 'All providers' },
    { value: 'openai', label: 'OpenAI' },
    { value: 'anthropic', label: 'Anthropic' },
    { value: 'gemini', label: 'Gemini' },
    { value: 'mock', label: 'Mock' },
];

const GUIDED_DEFAULTS = {
    metric: 'count',
    timeRange: '24h',
    xAxis: 'timestamp',
    breakdown: '',
    statusFilter: 'all',
    providerFilter: 'all',
    limit: 200,
};

const CHART_TEMPLATES = [
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
const formatAql = (query: string): string => {
    if (!query.trim()) return query;
    // Add line breaks after keywords
    let formatted = query.trim()
        .replace(/\s+/g, ' ')
        .replace(/\b(from|select|filter|dimensions|measures|sort|limit)\b/gi, '\n$1')
        .trim();
    // Indent lines after the first
    const lines = formatted.split('\n');
    return lines.map((line, i) => i === 0 ? line : '  ' + line.trim()).join('\n');
};

const formatAqlLiteral = (value: any): string => {
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

const buildAqlFromBuilder = (builder: AqlBuilder): string => {
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

const StatCard = ({
    title,
    value,
    unit,
    change,
    loading,
    icon,
    tone = 'slate',
}: {
    title: string;
    value: string;
    unit?: string;
    change?: string;
    loading?: boolean;
    icon?: React.ReactNode;
    tone?: string;
}) => (
    <Card className="p-6">
        <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
                {icon && (
                    <span className={`icon-chip icon-chip--${tone}`}>
                        {icon}
                    </span>
                )}
                <div className="min-w-0">
                    <h3 className="text-text-muted text-[10px] font-bold uppercase tracking-widest opacity-70">{title}</h3>
                    <div className="mt-2 flex items-baseline gap-1">
                        <span className="text-3xl font-bold text-text-main tracking-tight">{loading ? '--' : value}</span>
                        {unit && <span className="text-sm text-text-muted font-medium ml-1">{unit}</span>}
                    </div>
                </div>
            </div>
            {change && (
                <Badge variant="neutral" className="text-[9px]">
                    {change}
                </Badge>
            )}
        </div>
    </Card>
);

const percentile = (values: number[], p: number) => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.max(0, Math.ceil(p * (sorted.length - 1)));
    return sorted[idx];
};

const Dashboard: React.FC<DashboardProps> = ({ projectId }) => {
    const [logs, setLogs] = useState<LogRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [charts, setCharts] = useState<MonitorChart[]>([]);
    const [chartData, setChartData] = useState<Record<string, any[]>>({});
    const [chartErrors, setChartErrors] = useState<Record<string, string>>({});
    const [chartLoading, setChartLoading] = useState(false);
    const [showChartBuilder, setShowChartBuilder] = useState(false);
    const [editingChartId, setEditingChartId] = useState<string | null>(null);
    const [chartError, setChartError] = useState<string | null>(null);
    const [chartMode, setChartMode] = useState<'guided' | 'advanced'>('guided');
    const [guidedConfig, setGuidedConfig] = useState({ ...GUIDED_DEFAULTS });
    const [previewRows, setPreviewRows] = useState<any[]>([]);
    const [previewQuery, setPreviewQuery] = useState<string>('');
    const [previewError, setPreviewError] = useState<string | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [newChart, setNewChart] = useState({
        name: '',
        query: '',
        chart_type: 'line',
        x_field: 'timestamp',
        y_field: 'total_tokens',
        series_field: '',
    });

    useEffect(() => {
        if (!projectId) return;
        const fetchData = async () => {
            setLoading(true);
            try {
                const sinceMs = Date.now() - 24 * 60 * 60 * 1000;
                const query = `from project_logs(project_id="${projectId}") select timestamp, latency_ms, cost, status filter timestamp >= ${sinceMs} sort timestamp asc limit 5000`;
                const result = await api.runAqlQuery(query);
                setLogs(result.data as LogRow[]);
            } catch {
                setLogs([]);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [projectId]);

    useEffect(() => {
        if (!projectId) return;
        const fetchCharts = async () => {
            try {
                const result = await api.getCharts(projectId);
                setCharts(result);
            } catch {
                setCharts([]);
            }
        };
        fetchCharts();
    }, [projectId]);

    useEffect(() => {
        if (charts.length === 0) {
            setChartData({});
            setChartErrors({});
            return;
        }
        const fetchChartData = async () => {
            setChartLoading(true);
            const nextData: Record<string, any[]> = {};
            const nextErrors: Record<string, string> = {};
            await Promise.all(
                charts.map(async (chart) => {
                    try {
                        const result = await api.runAqlQuery(chart.query);
                        nextData[chart.id] = result.data || [];
                    } catch (e: any) {
                        nextErrors[chart.id] = e?.message || 'Failed to load chart';
                        nextData[chart.id] = [];
                    }
                })
            );
            setChartData(nextData);
            setChartErrors(nextErrors);
            setChartLoading(false);
        };
        fetchChartData();
    }, [charts]);

    const stats = useMemo(() => {
        const totalRequests = logs.length;
        const latencies = logs.map(l => l.latency_ms).filter((v): v is number => typeof v === 'number');
        const costs = logs.map(l => l.cost).filter((v): v is number => typeof v === 'number');
        const errorCount = logs.filter(l => l.status === 'error').length;
        const avgLatency = latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
        const totalCost = costs.length ? costs.reduce((a, b) => a + b, 0) : 0;
        const errorRate = totalRequests ? (errorCount / totalRequests) * 100 : 0;
        return { totalRequests, avgLatency, totalCost, errorRate };
    }, [logs]);

    const requestChartData = useMemo(() => {
        const sinceMs = Date.now() - 24 * 60 * 60 * 1000;
        const start = new Date(sinceMs);
        start.setMinutes(0, 0, 0);
        const bucketStartMs = start.getTime();
        const buckets: { name: string; requests: number; latencies: number[] }[] = [];

        for (let i = 0; i < 24; i++) {
            const ts = bucketStartMs + i * 60 * 60 * 1000;
            const label = new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            buckets.push({ name: label, requests: 0, latencies: [] });
        }

        logs.forEach((log) => {
            const ts = log.timestamp;
            if (!ts) return;
            const idx = Math.floor((ts - bucketStartMs) / (60 * 60 * 1000));
            if (idx < 0 || idx >= buckets.length) return;
            buckets[idx].requests += 1;
            if (typeof log.latency_ms === 'number') {
                buckets[idx].latencies.push(log.latency_ms);
            }
        });

        return buckets.map(bucket => ({
            name: bucket.name,
            requests: bucket.requests,
            latency: percentile(bucket.latencies, 0.95),
        }));
    }, [logs]);

    const guidedMetric = useMemo(() => {
        return GUIDED_METRICS.find((metric) => metric.id === guidedConfig.metric) || GUIDED_METRICS[0];
    }, [guidedConfig.metric]);

    const guidedBuilder = useMemo<AqlBuilder>(() => {
        const filters = [];
        const range = GUIDED_TIME_RANGES.find((opt) => opt.id === guidedConfig.timeRange);
        if (range?.ms) {
            filters.push({
                field: 'timestamp',
                op: '>=',
                value: `now() - ${range.ms}`,
            });
        }
        if (guidedConfig.statusFilter !== 'all') {
            filters.push({
                field: 'status',
                op: '=',
                value: guidedConfig.statusFilter,
            });
        }
        if (guidedConfig.providerFilter !== 'all') {
            filters.push({
                field: 'provider',
                op: '=',
                value: guidedConfig.providerFilter,
            });
        }

        const dimensions = [guidedConfig.xAxis].filter(Boolean);
        if (guidedConfig.breakdown && guidedConfig.breakdown !== guidedConfig.xAxis) {
            dimensions.push(guidedConfig.breakdown);
        }

        return {
            shape: 'project_logs',
            params: { project_id: projectId },
            filters,
            dimensions,
            measures: [
                {
                    func: guidedMetric.func,
                    field: guidedMetric.field,
                    alias: guidedMetric.alias,
                },
            ],
            sort: { field: guidedConfig.xAxis, direction: 'asc' },
            limit: guidedConfig.limit,
        };
    }, [guidedConfig, guidedMetric, projectId]);

    const guidedQuery = useMemo(() => {
        if (!projectId) return '';
        return buildAqlFromBuilder(guidedBuilder);
    }, [guidedBuilder, projectId]);

    const guidedSummary = useMemo(() => {
        const range = GUIDED_TIME_RANGES.find((opt) => opt.id === guidedConfig.timeRange);
        const axisLabel = GUIDED_AXIS_FIELDS.find((f) => f.value === guidedConfig.xAxis)?.label || guidedConfig.xAxis;
        const breakdownLabel = GUIDED_BREAKDOWN_FIELDS.find((f) => f.value === guidedConfig.breakdown)?.label || '';
        const statusLabel = GUIDED_STATUS_FILTERS.find((f) => f.value === guidedConfig.statusFilter)?.label || '';
        const providerLabel = GUIDED_PROVIDER_FILTERS.find((f) => f.value === guidedConfig.providerFilter)?.label || '';
        const parts = [
            `${guidedMetric.label.toLowerCase()} from logs`,
            range?.id === 'all' ? 'for all time' : `over ${range?.label.toLowerCase()}`,
            `plotted by ${axisLabel.toLowerCase()}`,
        ];
        if (breakdownLabel && breakdownLabel !== 'None') {
            parts.push(`split by ${breakdownLabel.toLowerCase()}`);
        }
        if (statusLabel && statusLabel !== 'All statuses') {
            parts.push(statusLabel.toLowerCase());
        }
        if (providerLabel && providerLabel !== 'All providers') {
            parts.push(providerLabel.toLowerCase());
        }
        return parts.join(', ');
    }, [guidedConfig, guidedMetric]);

    const previewQueryText = useMemo(() => {
        if (previewQuery) return previewQuery;
        if (chartMode === 'guided') return guidedQuery;
        return newChart.query;
    }, [previewQuery, chartMode, guidedQuery, newChart.query]);

    const previewColumns = useMemo(() => {
        if (!previewRows.length) return [];
        return Object.keys(previewRows[0]).slice(0, 4);
    }, [previewRows]);

    const previewSample = useMemo(() => previewRows.slice(0, 6), [previewRows]);

    const chartQueryTemplate = () =>
        `from project_logs(project_id="${projectId}") select timestamp, total_tokens sort timestamp asc limit 200`;

    const resetChartForm = () => {
        setEditingChartId(null);
        setChartError(null);
        setChartMode('guided');
        setGuidedConfig({ ...GUIDED_DEFAULTS });
        setPreviewRows([]);
        setPreviewQuery('');
        setPreviewError(null);
        setNewChart({
            name: '',
            query: chartQueryTemplate(),
            chart_type: 'line',
            x_field: 'timestamp',
            y_field: 'total_tokens',
            series_field: '',
        });
    };

    useEffect(() => {
        if (chartMode !== 'guided') return;
        setNewChart((prev) => ({
            ...prev,
            x_field: guidedConfig.xAxis,
            y_field: guidedMetric.alias,
            series_field: guidedConfig.breakdown || '',
            query: guidedQuery,
        }));
    }, [
        chartMode,
        guidedConfig.xAxis,
        guidedConfig.breakdown,
        guidedMetric.alias,
        guidedQuery,
    ]);

    const handleSaveChart = async () => {
        try {
            setChartError(null);
            if (!newChart.name.trim()) {
                setChartError('Chart name is required.');
                return;
            }

            let query = newChart.query;
            let xField = newChart.x_field;
            let yField = newChart.y_field;
            let seriesField = newChart.series_field ? newChart.series_field : null;
            let config: Record<string, any> = {};

            if (chartMode === 'guided') {
                query = guidedQuery;
                xField = guidedConfig.xAxis;
                yField = guidedMetric.alias;
                seriesField = guidedConfig.breakdown ? guidedConfig.breakdown : null;
                config = {
                    mode: 'guided',
                    builder: guidedBuilder,
                    ui: guidedConfig,
                };
            } else {
                config = { mode: 'advanced' };
            }

            if (!query || !query.trim()) {
                setChartError('Query cannot be empty.');
                return;
            }

            const payload = {
                project_id: projectId,
                name: newChart.name,
                query,
                chart_type: newChart.chart_type,
                x_field: xField,
                y_field: yField,
                series_field: seriesField,
                config,
            };
            if (editingChartId) {
                const updatePayload = { ...payload };
                delete (updatePayload as any).project_id;
                await api.updateChart(editingChartId, updatePayload);
            } else {
                await api.createChart(payload);
            }
            setShowChartBuilder(false);
            resetChartForm();
            const result = await api.getCharts(projectId);
            setCharts(result);
        } catch (e: any) {
            setChartError(e?.message || 'Failed to save chart.');
        }
    };

    const handleEditChart = (chart: MonitorChart) => {
        setEditingChartId(chart.id);
        setChartError(null);
        setShowChartBuilder(true);
        setPreviewRows([]);
        setPreviewQuery('');
        setPreviewError(null);
        const config = chart.config || {};
        if (config.mode === 'guided' && config.ui) {
            setChartMode('guided');
            setGuidedConfig({ ...GUIDED_DEFAULTS, ...(config.ui as any) });
        } else {
            setChartMode('advanced');
        }
        setNewChart({
            name: chart.name,
            query: chart.query,
            chart_type: chart.chart_type,
            x_field: chart.x_field,
            y_field: chart.y_field,
            series_field: chart.series_field || '',
        });
    };

    const handleDeleteChart = async (chartId: string) => {
        if (!confirm('Delete this chart?')) return;
        await api.deleteChart(chartId);
        const result = await api.getCharts(projectId);
        setCharts(result);
    };

    const handleRefreshCharts = async () => {
        const result = await api.getCharts(projectId);
        setCharts(result);
    };

    const handlePreviewChart = async () => {
        setPreviewLoading(true);
        setPreviewError(null);
        try {
            const payload =
                chartMode === 'guided'
                    ? { builder: guidedBuilder }
                    : newChart.query;
            const result = await api.runAqlQuery(payload);
            setPreviewRows(result.data || []);
            setPreviewQuery(result.query || '');
        } catch (e: any) {
            setPreviewRows([]);
            setPreviewQuery('');
            setPreviewError(e?.message || 'Failed to preview query');
        } finally {
            setPreviewLoading(false);
        }
    };

    const handleApplyTemplate = (template: typeof CHART_TEMPLATES[number]) => {
        setChartMode('guided');
        setGuidedConfig({ ...GUIDED_DEFAULTS, ...(template.guided as any) });
        setNewChart((prev) => ({
            ...prev,
            chart_type: template.chart_type,
            name: prev.name || template.name,
        }));
    };

    const buildSeriesData = (rows: any[], chart: MonitorChart) => {
        if (!chart.series_field) {
            return { data: rows, seriesKeys: [chart.y_field] };
        }
        const pivot = new Map<any, any>();
        const seriesSet = new Set<string>();
        rows.forEach((row) => {
            const xValue = row[chart.x_field];
            const seriesValue = row[chart.series_field as string];
            const yValue = row[chart.y_field];
            if (xValue === undefined || seriesValue === undefined) return;
            const entry = pivot.get(xValue) || { [chart.x_field]: xValue };
            entry[String(seriesValue)] = yValue;
            pivot.set(xValue, entry);
            seriesSet.add(String(seriesValue));
        });
        const data = Array.from(pivot.values()).sort((a, b) => {
            const aVal = a[chart.x_field];
            const bVal = b[chart.x_field];
            if (typeof aVal === 'number' && typeof bVal === 'number') {
                return aVal - bVal;
            }
            return String(aVal).localeCompare(String(bVal));
        });
        return { data, seriesKeys: Array.from(seriesSet) };
    };

    const formatXAxis = (value: any, key: string) => {
        if (typeof value === 'number' && (key.includes('time') || key.includes('timestamp'))) {
            return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        return String(value);
    };

    const SERIES_COLORS = [
        'var(--accent-primary)',
        '#3B82F6',
        '#D16A3A',
        '#5B5CE5',
        '#E25778',
    ];

    return (
        <div className="h-full flex flex-col bg-app">
            <PageHeader
                title="Dashboard"
                subtitle="Real-time performance and usage metrics for your AI services."
            />

            <div className="flex-1 overflow-y-auto p-6">

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <StatCard
                        title="Total Requests"
                        value={stats.totalRequests.toLocaleString()}
                        change="Last 24h"
                        loading={loading}
                        tone="sky"
                        icon={<ChartBarIcon className="w-4 h-4" />}
                    />
                    <StatCard
                        title="Avg Latency"
                        value={stats.avgLatency.toFixed(0)}
                        unit="ms"
                        change="Last 24h"
                        loading={loading}
                        tone="slate"
                        icon={<ClockIcon className="w-4 h-4" />}
                    />
                    <StatCard
                        title="Total Cost"
                        value={`$${stats.totalCost.toFixed(2)}`}
                        change="Last 24h"
                        loading={loading}
                        tone="amber"
                        icon={<CurrencyDollarIcon className="w-4 h-4" />}
                    />
                    <StatCard
                        title="Error Rate"
                        value={stats.errorRate.toFixed(2)}
                        unit="%"
                        change="Last 24h"
                        loading={loading}
                        tone="rose"
                        icon={<ExclamationTriangleIcon className="w-4 h-4" />}
                    />
                </div>

                <div className="grid grid-cols-2 gap-8 h-80 mb-8">
                    <Card className="p-6">
                        <h3 className="text-text-main text-sm font-bold mb-6 tracking-tight">Request Volume (24h)</h3>
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={requestChartData}>
                                <defs>
                                    <linearGradient id="colorReq" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="var(--accent-primary)" stopOpacity={0.22} />
                                        <stop offset="95%" stopColor="var(--accent-primary)" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-base)" vertical={false} />
                                <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={10} tickLine={false} axisLine={false} dy={10} />
                                <YAxis stroke="var(--text-muted)" fontSize={10} tickLine={false} axisLine={false} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-base)', borderRadius: '8px', color: 'var(--text-main)', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                    itemStyle={{ color: 'var(--accent-primary)' }}
                                />
                                <Area type="monotone" dataKey="requests" stroke="var(--accent-primary)" strokeWidth={2} fillOpacity={1} fill="url(#colorReq)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </Card>

                    <Card className="p-6">
                        <h3 className="text-text-main text-sm font-bold mb-6 tracking-tight">P95 Latency (ms)</h3>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={requestChartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-base)" vertical={false} />
                                <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={10} tickLine={false} axisLine={false} dy={10} />
                                <YAxis stroke="var(--text-muted)" fontSize={10} tickLine={false} axisLine={false} />
                                <Tooltip
                                    cursor={{ fill: 'var(--bg-panel-hover)', radius: 8 }}
                                    contentStyle={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-base)', borderRadius: '8px', color: 'var(--text-main)', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                />
                                <Bar dataKey="latency" fill="var(--accent-primary)" radius={[6, 6, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </Card>
                </div>

                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h2 className="text-xl font-semibold text-text-main">Custom Charts</h2>
                        <p className="text-xs text-text-muted mt-1">Saved AQL queries rendered as reusable dashboards.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="secondary" size="sm" onClick={handleRefreshCharts}>
                            Refresh
                        </Button>
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={() => {
                                resetChartForm();
                                setShowChartBuilder(true);
                            }}
                        >
                            + Add Chart
                        </Button>
                    </div>
                </div>

                {showChartBuilder && (
                    <Card className="p-6 mb-6 space-y-5">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h3 className="text-sm font-semibold text-text-main">Chart Builder</h3>
                                <p className="text-xs text-text-muted mt-1">
                                    Guided setup for non-coders, with full AQL access when you want to go deeper.
                                </p>
                            </div>
                            <Tabs
                                options={[
                                    { id: 'guided', label: 'Guided' },
                                    { id: 'advanced', label: 'AQL' },
                                ]}
                                value={chartMode}
                                onChange={(value) => setChartMode(value as 'guided' | 'advanced')}
                            />
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr,1fr] gap-6">
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[10px] uppercase font-bold text-text-muted tracking-wide">Chart Name</label>
                                        <Input
                                            value={newChart.name}
                                            onChange={(e) => setNewChart((prev) => ({ ...prev, name: e.target.value }))}
                                            placeholder="e.g. Token usage over time"
                                            className="text-xs"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] uppercase font-bold text-text-muted tracking-wide">Chart Type</label>
                                        <Select
                                            value={newChart.chart_type}
                                            onChange={(e) => setNewChart((prev) => ({ ...prev, chart_type: e.target.value }))}
                                            className="text-xs"
                                        >
                                            <option value="line">Line</option>
                                            <option value="area">Area</option>
                                            <option value="bar">Bar</option>
                                        </Select>
                                    </div>
                                </div>

                                {chartMode === 'guided' ? (
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                            {CHART_TEMPLATES.map((template) => (
                                                <button
                                                    key={template.id}
                                                    type="button"
                                                    onClick={() => handleApplyTemplate(template)}
                                                    className="rounded-lg border border-border-base bg-panel/60 p-3 text-left hover:border-primary/40 hover:bg-panel-hover transition"
                                                >
                                                    <div className="text-xs font-semibold text-text-main">{template.name}</div>
                                                    <div className="text-[11px] text-text-muted mt-1">{template.description}</div>
                                                </button>
                                            ))}
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-1">
                                                <label className="text-[10px] uppercase font-bold text-text-muted tracking-wide">Metric</label>
                                                <Select
                                                    value={guidedConfig.metric}
                                                    onChange={(e) => setGuidedConfig((prev) => ({ ...prev, metric: e.target.value }))}
                                                    className="text-xs"
                                                >
                                                    {GUIDED_METRICS.map((metric) => (
                                                        <option key={metric.id} value={metric.id}>{metric.label}</option>
                                                    ))}
                                                </Select>
                                                <div className="text-[11px] text-text-muted">{guidedMetric.description}</div>
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] uppercase font-bold text-text-muted tracking-wide">Time Range</label>
                                                <Select
                                                    value={guidedConfig.timeRange}
                                                    onChange={(e) => setGuidedConfig((prev) => ({ ...prev, timeRange: e.target.value }))}
                                                    className="text-xs"
                                                >
                                                    {GUIDED_TIME_RANGES.map((range) => (
                                                        <option key={range.id} value={range.id}>{range.label}</option>
                                                    ))}
                                                </Select>
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] uppercase font-bold text-text-muted tracking-wide">X Axis</label>
                                                <Select
                                                    value={guidedConfig.xAxis}
                                                    onChange={(e) => setGuidedConfig((prev) => ({ ...prev, xAxis: e.target.value }))}
                                                    className="text-xs"
                                                >
                                                    {GUIDED_AXIS_FIELDS.map((field) => (
                                                        <option key={field.value} value={field.value}>{field.label}</option>
                                                    ))}
                                                </Select>
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] uppercase font-bold text-text-muted tracking-wide">Breakdown</label>
                                                <Select
                                                    value={guidedConfig.breakdown}
                                                    onChange={(e) => setGuidedConfig((prev) => ({ ...prev, breakdown: e.target.value }))}
                                                    className="text-xs"
                                                >
                                                    {GUIDED_BREAKDOWN_FIELDS.map((field) => (
                                                        <option key={field.value} value={field.value}>{field.label}</option>
                                                    ))}
                                                </Select>
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] uppercase font-bold text-text-muted tracking-wide">Status Filter</label>
                                                <Select
                                                    value={guidedConfig.statusFilter}
                                                    onChange={(e) => setGuidedConfig((prev) => ({ ...prev, statusFilter: e.target.value }))}
                                                    className="text-xs"
                                                >
                                                    {GUIDED_STATUS_FILTERS.map((field) => (
                                                        <option key={field.value} value={field.value}>{field.label}</option>
                                                    ))}
                                                </Select>
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] uppercase font-bold text-text-muted tracking-wide">Provider Filter</label>
                                                <Select
                                                    value={guidedConfig.providerFilter}
                                                    onChange={(e) => setGuidedConfig((prev) => ({ ...prev, providerFilter: e.target.value }))}
                                                    className="text-xs"
                                                >
                                                    {GUIDED_PROVIDER_FILTERS.map((field) => (
                                                        <option key={field.value} value={field.value}>{field.label}</option>
                                                    ))}
                                                </Select>
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] uppercase font-bold text-text-muted tracking-wide">Result Limit</label>
                                                <Input
                                                    type="number"
                                                    min={10}
                                                    value={guidedConfig.limit}
                                                    onChange={(e) => {
                                                        const next = Number(e.target.value);
                                                        setGuidedConfig((prev) => ({ ...prev, limit: Number.isFinite(next) && next > 0 ? next : prev.limit }));
                                                    }}
                                                    className="text-xs"
                                                />
                                            </div>
                                        </div>

                                        <div className="rounded-lg border border-border-base bg-panel/60 p-4">
                                            <div className="text-[10px] uppercase font-bold text-text-muted tracking-wide">Summary</div>
                                            <p className="text-xs text-text-main mt-2">{guidedSummary}</p>
                                            <div className="flex flex-wrap gap-2 mt-3">
                                                <Badge variant="neutral">X: {GUIDED_AXIS_FIELDS.find((f) => f.value === guidedConfig.xAxis)?.label}</Badge>
                                                <Badge variant="neutral">Y: {guidedMetric.label}</Badge>
                                                {guidedConfig.breakdown && (
                                                    <Badge variant="neutral">Split: {GUIDED_BREAKDOWN_FIELDS.find((f) => f.value === guidedConfig.breakdown)?.label}</Badge>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div className="space-y-1">
                                                <label className="text-[10px] uppercase font-bold text-text-muted tracking-wide">X Axis Field</label>
                                                <Select
                                                    value={newChart.x_field}
                                                    onChange={(e) => setNewChart((prev) => ({ ...prev, x_field: e.target.value }))}
                                                    className="text-xs"
                                                >
                                                    {X_AXIS_FIELDS.map(f => (
                                                        <option key={f.value} value={f.value}>{f.label}</option>
                                                    ))}
                                                </Select>
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] uppercase font-bold text-text-muted tracking-wide">Y Axis Field</label>
                                                <Select
                                                    value={newChart.y_field}
                                                    onChange={(e) => setNewChart((prev) => ({ ...prev, y_field: e.target.value }))}
                                                    className="text-xs"
                                                >
                                                    {Y_AXIS_FIELDS.map(f => (
                                                        <option key={f.value} value={f.value}>{f.label}</option>
                                                    ))}
                                                </Select>
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] uppercase font-bold text-text-muted tracking-wide">Series Grouping</label>
                                                <Select
                                                    value={newChart.series_field}
                                                    onChange={(e) => setNewChart((prev) => ({ ...prev, series_field: e.target.value }))}
                                                    className="text-xs"
                                                >
                                                    {SERIES_FIELDS.map(f => (
                                                        <option key={f.value} value={f.value}>{f.label}</option>
                                                    ))}
                                                </Select>
                                            </div>
                                        </div>

                                        <div className="space-y-1">
                                            <div className="flex justify-between items-center">
                                                <label className="text-[10px] uppercase font-bold text-text-muted tracking-wide">AQL Query</label>
                                                <span className="text-[10px] text-text-muted">Fields: timestamp, latency_ms, cost, total_tokens, model, status</span>
                                            </div>
                                            <Textarea
                                                value={newChart.query}
                                                onChange={(e) => setNewChart((prev) => ({ ...prev, query: e.target.value }))}
                                                onBlur={() => setNewChart((prev) => ({ ...prev, query: formatAql(prev.query) }))}
                                                placeholder='AQL query (ex: from project_logs(project_id="...") select timestamp, total_tokens)'
                                                className="font-mono text-xs h-28 resize-none"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-4">
                                <div className="rounded-lg border border-border-base bg-panel/60 p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <div className="text-xs font-semibold text-text-main">Preview</div>
                                            <div className="text-[11px] text-text-muted">Check the output before you save.</div>
                                        </div>
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={handlePreviewChart}
                                            disabled={!previewQueryText.trim() || previewLoading}
                                        >
                                            {previewLoading ? 'Running...' : 'Preview data'}
                                        </Button>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] uppercase font-bold text-text-muted tracking-wide">Generated AQL</label>
                                        <Textarea
                                            value={formatAql(previewQueryText)}
                                            readOnly
                                            className="font-mono text-xs h-32 resize-none bg-panel"
                                        />
                                    </div>
                                    {previewError && (
                                        <div className="text-xs text-rose-500 font-bold bg-rose-500/10 rounded-md p-3">
                                            {previewError}
                                        </div>
                                    )}
                                    {!previewLoading && !previewError && previewSample.length === 0 && (
                                        <div className="text-[11px] text-text-muted italic">
                                            Run a preview to see sample rows.
                                        </div>
                                    )}
                                    {previewSample.length > 0 && (
                                        <div className="overflow-auto border border-border-base rounded-md">
                                            <table className="w-full text-[11px]">
                                                <thead className="bg-panel-hover text-text-muted">
                                                    <tr>
                                                        {previewColumns.map((col) => (
                                                            <th key={col} className="px-2 py-2 text-left font-semibold">{col}</th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {previewSample.map((row, idx) => (
                                                        <tr key={idx} className="border-t border-border-base text-text-main">
                                                            {previewColumns.map((col) => (
                                                                <td key={col} className="px-2 py-2">
                                                                    {row[col] !== null && row[col] !== undefined ? String(row[col]) : '--'}
                                                                </td>
                                                            ))}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {chartError && <div className="text-xs text-rose-500 font-bold bg-rose-500/10 rounded-md p-3">{chartError}</div>}
                        <div className="flex items-center gap-2">
                            <Button variant="primary" size="sm" onClick={handleSaveChart}>
                                {editingChartId ? 'Update Chart' : 'Save Chart'}
                            </Button>
                            <Button
                                onClick={() => {
                                    setShowChartBuilder(false);
                                    resetChartForm();
                                }}
                                variant="secondary"
                                size="sm"
                            >
                                Cancel
                            </Button>
                        </div>
                    </Card>
                )}

                <div className="grid grid-cols-2 gap-6">
                    {charts.length === 0 && (
                        <div className="col-span-2 bg-panel border border-border-base rounded-lg p-6 text-center text-text-muted text-sm italic">
                            No custom charts yet. Add one to visualize AQL results.
                        </div>
                    )}
                    {charts.map((chart) => {
                        const rows = chartData[chart.id] || [];
                        const { data, seriesKeys } = buildSeriesData(rows, chart);
                        const isEmpty = data.length === 0;
                        return (
                            <Card key={chart.id} className="p-6 flex flex-col">
                                <div className="flex items-start justify-between mb-4">
                                    <div>
                                        <h3 className="text-text-main text-sm font-bold">{chart.name}</h3>
                                        <div className="text-[10px] text-text-muted mt-1 uppercase tracking-widest">{chart.chart_type}</div>
                                    </div>
                                    <div className="flex items-center gap-2 text-[10px] text-text-muted">
                                        <Button variant="ghost" size="sm" onClick={() => handleEditChart(chart)}>Edit</Button>
                                        <Button variant="ghost" size="sm" className="text-rose-500 hover:text-rose-600" onClick={() => handleDeleteChart(chart.id)}>Delete</Button>
                                    </div>
                                </div>
                                {chartErrors[chart.id] && (
                                    <div className="text-xs text-rose-500 font-bold bg-rose-500/10 rounded-md p-3 mb-3">
                                        {chartErrors[chart.id]}
                                    </div>
                                )}
                                {chartLoading && charts.length > 0 && (
                                    <div className="text-xs text-text-muted italic mb-3">Refreshing chart data...</div>
                                )}
                                {isEmpty ? (
                                    <div className="flex-1 flex items-center justify-center text-xs text-text-muted italic">
                                        No data returned for this query.
                                    </div>
                                ) : (
                                    <div className="flex-1 min-h-[220px]">
                                        <ResponsiveContainer width="100%" height="100%">
                                            {chart.chart_type === 'bar' ? (
                                                <BarChart data={data}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-base)" vertical={false} />
                                                    <XAxis
                                                        dataKey={chart.x_field}
                                                        stroke="var(--text-muted)"
                                                        fontSize={10}
                                                        tickLine={false}
                                                        axisLine={false}
                                                        tickFormatter={(value) => formatXAxis(value, chart.x_field)}
                                                    />
                                                    <YAxis stroke="var(--text-muted)" fontSize={10} tickLine={false} axisLine={false} />
                                                    <Tooltip
                                                        cursor={{ fill: 'var(--bg-panel-hover)', radius: 8 }}
                                                        contentStyle={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-base)', borderRadius: '12px', color: 'var(--text-main)' }}
                                                    />
                                                    {seriesKeys.map((key, idx) => (
                                                        <Bar
                                                            key={key}
                                                            dataKey={key}
                                                            fill={SERIES_COLORS[idx % SERIES_COLORS.length]}
                                                            radius={[6, 6, 0, 0]}
                                                            stackId={chart.series_field ? 'stack' : undefined}
                                                        />
                                                    ))}
                                                </BarChart>
                                            ) : chart.chart_type === 'area' ? (
                                                <AreaChart data={data}>
                                                    <defs>
                                                        {seriesKeys.map((key, idx) => (
                                                            <linearGradient key={key} id={`area-${chart.id}-${idx}`} x1="0" y1="0" x2="0" y2="1">
                                                                <stop offset="5%" stopColor={SERIES_COLORS[idx % SERIES_COLORS.length]} stopOpacity={0.35} />
                                                                <stop offset="95%" stopColor={SERIES_COLORS[idx % SERIES_COLORS.length]} stopOpacity={0} />
                                                            </linearGradient>
                                                        ))}
                                                    </defs>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-base)" vertical={false} />
                                                    <XAxis
                                                        dataKey={chart.x_field}
                                                        stroke="var(--text-muted)"
                                                        fontSize={10}
                                                        tickLine={false}
                                                        axisLine={false}
                                                        tickFormatter={(value) => formatXAxis(value, chart.x_field)}
                                                    />
                                                    <YAxis stroke="var(--text-muted)" fontSize={10} tickLine={false} axisLine={false} />
                                                    <Tooltip
                                                        contentStyle={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-base)', borderRadius: '12px', color: 'var(--text-main)' }}
                                                    />
                                                    {seriesKeys.map((key, idx) => (
                                                        <Area
                                                            key={key}
                                                            type="monotone"
                                                            dataKey={key}
                                                            stroke={SERIES_COLORS[idx % SERIES_COLORS.length]}
                                                            strokeWidth={2}
                                                            fillOpacity={1}
                                                            fill={`url(#area-${chart.id}-${idx})`}
                                                        />
                                                    ))}
                                                </AreaChart>
                                            ) : (
                                                <LineChart data={data}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-base)" vertical={false} />
                                                    <XAxis
                                                        dataKey={chart.x_field}
                                                        stroke="var(--text-muted)"
                                                        fontSize={10}
                                                        tickLine={false}
                                                        axisLine={false}
                                                        tickFormatter={(value) => formatXAxis(value, chart.x_field)}
                                                    />
                                                    <YAxis stroke="var(--text-muted)" fontSize={10} tickLine={false} axisLine={false} />
                                                    <Tooltip
                                                        contentStyle={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-base)', borderRadius: '12px', color: 'var(--text-main)' }}
                                                    />
                                                    {seriesKeys.map((key, idx) => (
                                                        <Line
                                                            key={key}
                                                            type="monotone"
                                                            dataKey={key}
                                                            stroke={SERIES_COLORS[idx % SERIES_COLORS.length]}
                                                            strokeWidth={2}
                                                            dot={false}
                                                        />
                                                    ))}
                                                </LineChart>
                                            )}
                                        </ResponsiveContainer>
                                    </div>
                                )}
                            </Card>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
