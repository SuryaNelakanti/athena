import React, { useEffect, useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, LineChart, Line } from 'recharts';
import { api } from '../../services/api';
import { MonitorChart } from '../../types';
import { Badge, Button, Card, Input, SectionHeader, Select, Textarea } from '../ui';

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

// Simple AQL formatter that adds line breaks and indentation
const formatAql = (query: string): string => {
    if (!query.trim()) return query;
    // Add line breaks after keywords
    let formatted = query.trim()
        .replace(/\s+/g, ' ')
        .replace(/\b(from|select|filter|sort|limit|group by)\b/gi, '\n$1')
        .trim();
    // Indent lines after the first
    const lines = formatted.split('\n');
    return lines.map((line, i) => i === 0 ? line : '  ' + line.trim()).join('\n');
};

const StatCard = ({ title, value, unit, change, loading }: { title: string, value: string, unit?: string, change?: string, loading?: boolean }) => (
    <Card className="p-6">
        <h3 className="text-text-muted text-[10px] font-bold uppercase tracking-widest mb-3 opacity-70">{title}</h3>
        <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold text-text-main tracking-tight">{loading ? '--' : value}</span>
            {unit && <span className="text-sm text-text-muted font-medium ml-1">{unit}</span>}
        </div>
        {change && (
            <Badge variant="success" className="mt-3">
                {change}
            </Badge>
        )}
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

    const chartQueryTemplate = () => `from project_logs(project_id="${projectId}") select timestamp, total_tokens sort timestamp asc limit 200`;

    const resetChartForm = () => {
        setEditingChartId(null);
        setChartError(null);
        setNewChart({
            name: '',
            query: chartQueryTemplate(),
            chart_type: 'line',
            x_field: 'timestamp',
            y_field: 'total_tokens',
            series_field: '',
        });
    };

    const handleSaveChart = async () => {
        if (!newChart.name.trim() || !newChart.query.trim()) {
            setChartError('Name and query are required.');
            return;
        }
        try {
            setChartError(null);
            const payload = {
                project_id: projectId,
                name: newChart.name,
                query: newChart.query,
                chart_type: newChart.chart_type,
                x_field: newChart.x_field,
                y_field: newChart.y_field,
                series_field: newChart.series_field ? newChart.series_field : null,
                config: {},
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

    const SERIES_COLORS = ['#6B8A5E', '#8BAF7E', '#A8C9A0', '#567048', '#415536'];

    return (
        <div className="p-6 h-full overflow-y-auto">
            <div className="mb-8">
                <SectionHeader
                    title="Project Overview"
                    subtitle="Real-time performance and usage metrics for your AI services."
                />
            </div>

            <div className="grid grid-cols-4 gap-6 mb-8">
                <StatCard title="Total Requests" value={stats.totalRequests.toLocaleString()} change="Last 24h" loading={loading} />
                <StatCard title="Avg Latency" value={stats.avgLatency.toFixed(0)} unit="ms" change="Last 24h" loading={loading} />
                <StatCard title="Total Cost" value={`$${stats.totalCost.toFixed(2)}`} change="Last 24h" loading={loading} />
                <StatCard title="Error Rate" value={stats.errorRate.toFixed(2)} unit="%" change="Last 24h" loading={loading} />
            </div>

            <div className="grid grid-cols-2 gap-8 h-80 mb-8">
                <Card className="p-6">
                    <h3 className="text-text-main text-sm font-bold mb-6 tracking-tight">Request Volume (24h)</h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={requestChartData}>
                            <defs>
                                <linearGradient id="colorReq" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#6B8A5E" stopOpacity={0.25} />
                                    <stop offset="95%" stopColor="#6B8A5E" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-base)" vertical={false} />
                            <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={10} tickLine={false} axisLine={false} dy={10} />
                            <YAxis stroke="var(--text-muted)" fontSize={10} tickLine={false} axisLine={false} />
                            <Tooltip
                                contentStyle={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-base)', borderRadius: '8px', color: 'var(--text-main)', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                itemStyle={{ color: '#6B8A5E' }}
                            />
                            <Area type="monotone" dataKey="requests" stroke="#6B8A5E" strokeWidth={2} fillOpacity={1} fill="url(#colorReq)" />
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
                            <Bar dataKey="latency" fill="#10b981" radius={[6, 6, 0, 0]} />
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
                <Card className="p-5 mb-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-[10px] uppercase font-bold text-text-muted tracking-wide">Chart Name</label>
                            <Input
                                value={newChart.name}
                                onChange={(e) => setNewChart((prev) => ({ ...prev, name: e.target.value }))}
                                placeholder="e.g. Daily Token Usage"
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
                            onBlur={(e) => setNewChart((prev) => ({ ...prev, query: formatAql(prev.query) }))}
                            placeholder='AQL query (ex: from project_logs(project_id="...") select timestamp, total_tokens)'
                            className="font-mono text-xs h-28 resize-none"
                        />
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
    );
};

export default Dashboard;
