import React, { useEffect, useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { api } from '../services/api';

interface DashboardProps {
    projectId: string;
}

type LogRow = {
    timestamp?: number;
    latency_ms?: number | null;
    cost?: number | null;
    status?: string;
};

const StatCard = ({ title, value, unit, change, loading }: { title: string, value: string, unit?: string, change?: string, loading?: boolean }) => (
    <div className="bg-panel border border-border-base p-6 rounded-2xl shadow-sm hover:shadow-md transition-all hover:border-border-hover">
        <h3 className="text-text-muted text-[10px] font-bold uppercase tracking-widest mb-3 opacity-70">{title}</h3>
        <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold text-text-main tracking-tight">{loading ? '--' : value}</span>
            {unit && <span className="text-sm text-text-muted font-medium ml-1">{unit}</span>}
        </div>
        {change && (
            <div className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-500/10 text-[10px] text-emerald-600 dark:text-emerald-400 mt-3 font-bold border border-emerald-500/20">
                {change}
            </div>
        )}
    </div>
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

    const chartData = useMemo(() => {
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

    return (
        <div className="p-8 h-full overflow-y-auto bg-app transition-colors duration-300">
            <div className="mb-8">
                <h1 className="text-3xl font-serif font-black text-text-main tracking-tight">Project Overview</h1>
                <p className="text-text-muted text-sm mt-1">Real-time performance and usage metrics for your AI services.</p>
            </div>

            <div className="grid grid-cols-4 gap-6 mb-8">
                <StatCard title="Total Requests" value={stats.totalRequests.toLocaleString()} change="Last 24h" loading={loading} />
                <StatCard title="Avg Latency" value={stats.avgLatency.toFixed(0)} unit="ms" change="Last 24h" loading={loading} />
                <StatCard title="Total Cost" value={`$${stats.totalCost.toFixed(2)}`} change="Last 24h" loading={loading} />
                <StatCard title="Error Rate" value={stats.errorRate.toFixed(2)} unit="%" change="Last 24h" loading={loading} />
            </div>

            <div className="grid grid-cols-2 gap-8 h-80 mb-8">
                <div className="bg-panel border border-border-base p-6 rounded-2xl shadow-sm">
                    <h3 className="text-text-main text-sm font-bold mb-6 tracking-tight">Request Volume (24h)</h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData}>
                            <defs>
                                <linearGradient id="colorReq" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#8D7CE4" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#8D7CE4" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-base)" vertical={false} />
                            <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={10} tickLine={false} axisLine={false} dy={10} />
                            <YAxis stroke="var(--text-muted)" fontSize={10} tickLine={false} axisLine={false} />
                            <Tooltip
                                contentStyle={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-base)', borderRadius: '12px', color: 'var(--text-main)', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                itemStyle={{ color: '#8D7CE4' }}
                            />
                            <Area type="monotone" dataKey="requests" stroke="#8D7CE4" strokeWidth={3} fillOpacity={1} fill="url(#colorReq)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                <div className="bg-panel border border-border-base p-6 rounded-2xl shadow-sm">
                    <h3 className="text-text-main text-sm font-bold mb-6 tracking-tight">P95 Latency (ms)</h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-base)" vertical={false} />
                            <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={10} tickLine={false} axisLine={false} dy={10} />
                            <YAxis stroke="var(--text-muted)" fontSize={10} tickLine={false} axisLine={false} />
                            <Tooltip
                                cursor={{ fill: 'var(--bg-panel-hover)', radius: 8 }}
                                contentStyle={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-base)', borderRadius: '12px', color: 'var(--text-main)', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                            />
                            <Bar dataKey="latency" fill="#10b981" radius={[6, 6, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
