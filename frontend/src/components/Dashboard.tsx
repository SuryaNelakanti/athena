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
    <div className="bg-gray-900 border border-gray-800 p-4 rounded-lg">
        <h3 className="text-gray-500 text-xs font-medium uppercase tracking-wider mb-2">{title}</h3>
        <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-white">{value}</span>
            {unit && <span className="text-sm text-gray-500">{unit}</span>}
        </div>
        {change && <div className="text-xs text-emerald-400 mt-2 font-medium">{change}</div>}
    </div>
);

const Dashboard: React.FC = () => {
    return (
        <div className="p-6 h-full overflow-y-auto bg-gray-950">
            <h1 className="text-xl font-bold text-white mb-6">Project Overview</h1>
            
            <div className="grid grid-cols-4 gap-6 mb-8">
                <StatCard title="Total Requests" value="14.2k" change="+12% vs last week" />
                <StatCard title="Avg Latency" value="432" unit="ms" change="-5% improvement" />
                <StatCard title="Total Cost" value="$124.50" change="+2% vs last week" />
                <StatCard title="Error Rate" value="0.4" unit="%" change="Stable" />
            </div>

            <div className="grid grid-cols-2 gap-6 h-80 mb-8">
                <div className="bg-gray-900 border border-gray-800 p-4 rounded-lg">
                    <h3 className="text-gray-400 text-sm font-medium mb-4">Request Volume (24h)</h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data}>
                            <defs>
                                <linearGradient id="colorReq" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                            <XAxis dataKey="name" stroke="#4b5563" fontSize={10} tickLine={false} axisLine={false} />
                            <YAxis stroke="#4b5563" fontSize={10} tickLine={false} axisLine={false} />
                            <Tooltip 
                                contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', color: '#f3f4f6' }}
                                itemStyle={{ color: '#818cf8' }}
                            />
                            <Area type="monotone" dataKey="requests" stroke="#6366f1" fillOpacity={1} fill="url(#colorReq)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                <div className="bg-gray-900 border border-gray-800 p-4 rounded-lg">
                    <h3 className="text-gray-400 text-sm font-medium mb-4">P95 Latency (ms)</h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                            <XAxis dataKey="name" stroke="#4b5563" fontSize={10} tickLine={false} axisLine={false} />
                            <YAxis stroke="#4b5563" fontSize={10} tickLine={false} axisLine={false} />
                            <Tooltip 
                                cursor={{fill: '#1f2937'}}
                                contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', color: '#f3f4f6' }}
                            />
                            <Bar dataKey="latency" fill="#10b981" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
