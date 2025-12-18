import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

const data = [
    { name: '00:00', requests: 40, latency: 240 },
    { name: '04:00', requests: 30, latency: 139 },
    { name: '08:00', requests: 200, latency: 980 },
    { name: '12:00', requests: 278, latency: 390 },
    { name: '16:00', requests: 189, latency: 480 },
    { name: '20:00', requests: 239, latency: 380 },
    { name: '23:59', requests: 349, latency: 430 },
];

const StatCard = ({ title, value, unit, change }: { title: string, value: string, unit?: string, change?: string }) => (
    <div className="bg-panel border border-border-base p-6 rounded-2xl shadow-sm hover:shadow-md transition-all hover:border-border-hover">
        <h3 className="text-text-muted text-[10px] font-bold uppercase tracking-widest mb-3 opacity-70">{title}</h3>
        <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold text-text-main tracking-tight">{value}</span>
            {unit && <span className="text-sm text-text-muted font-medium ml-1">{unit}</span>}
        </div>
        {change && (
            <div className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-500/10 text-[10px] text-emerald-600 dark:text-emerald-400 mt-3 font-bold border border-emerald-500/20">
                {change}
            </div>
        )}
    </div>
);

const Dashboard: React.FC = () => {
    return (
        <div className="p-8 h-full overflow-y-auto bg-app transition-colors duration-300">
            <div className="mb-8">
                <h1 className="text-3xl font-serif font-black text-text-main tracking-tight">Project Overview</h1>
                <p className="text-text-muted text-sm mt-1">Real-time performance and usage metrics for your AI services.</p>
            </div>

            <div className="grid grid-cols-4 gap-6 mb-8">
                <StatCard title="Total Requests" value="14.2k" change="+12% vs last week" />
                <StatCard title="Avg Latency" value="432" unit="ms" change="-5% improvement" />
                <StatCard title="Total Cost" value="$124.50" change="+2% vs last week" />
                <StatCard title="Error Rate" value="0.4" unit="%" change="Stable" />
            </div>

            <div className="grid grid-cols-2 gap-8 h-80 mb-8">
                <div className="bg-panel border border-border-base p-6 rounded-2xl shadow-sm">
                    <h3 className="text-text-main text-sm font-bold mb-6 tracking-tight">Request Volume (24h)</h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data}>
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
                        <BarChart data={data}>
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
