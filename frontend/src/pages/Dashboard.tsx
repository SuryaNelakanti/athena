import React, { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { ChartBarIcon, ClockIcon, CurrencyDollarIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { Button, Card } from '../components/ui';
import { PageHeader } from '../layouts/PageHeader';
import { useProject } from '../contexts/ProjectContext';
import { StatCard } from '../features/dashboard/StatCard';
import {
    buildRequestChartData,
    calculateDashboardStats,
} from '../features/dashboard/metrics';
import { useDashboardData } from '../features/dashboard/useDashboardData';
import { useDashboardChartBuilder } from '../features/dashboard/useDashboardChartBuilder';
import { MonitorChartGrid } from '../features/dashboard/MonitorChartGrid';
import { DashboardChartBuilder } from '../features/dashboard/DashboardChartBuilder';

const Dashboard: React.FC = () => {
    const { currentProject } = useProject();
    const projectId = currentProject?.id || '';
    const {
        logs,
        loading,
        logsError,
        charts,
        chartsError,
        chartData,
        chartErrors,
        chartLoading,
        refreshCharts,
        deleteChart,
    } = useDashboardData(projectId);
    const {
        showChartBuilder,
        editingChartId,
        chartError,
        chartMode,
        guidedConfig,
        guidedMetric,
        guidedSummary,
        newChart,
        previewQueryText,
        previewRows,
        previewError,
        previewLoading,
        setChartMode,
        openChartBuilder,
        closeChartBuilder,
        handleEditChart,
        handleSaveChart,
        handlePreviewChart,
        handleApplyTemplate,
        updateChartDraft,
        updateGuidedConfig,
    } = useDashboardChartBuilder({ projectId, refreshCharts });

    const stats = useMemo(() => calculateDashboardStats(logs), [logs]);
    const requestChartData = useMemo(() => buildRequestChartData(logs), [logs]);

    const handleDeleteChart = async (chartId: string) => {
        if (!confirm('Delete this chart?')) return;
        await deleteChart(chartId);
    };

    const handleRefreshCharts = async () => {
        await refreshCharts();
    };

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

                {logsError && (
                    <div role="alert" className="mb-6 rounded-md bg-rose-500/10 p-3 text-sm text-rose-500">
                        {logsError}
                    </div>
                )}

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
                            onClick={openChartBuilder}
                        >
                            + Add Chart
                        </Button>
                    </div>
                </div>

                {chartsError && (
                    <div role="alert" className="mb-4 rounded-md bg-rose-500/10 p-3 text-sm text-rose-500">
                        {chartsError}
                    </div>
                )}

                {showChartBuilder && (
                    <DashboardChartBuilder
                        chartMode={chartMode}
                        newChart={newChart}
                        guidedConfig={guidedConfig}
                        guidedMetric={guidedMetric}
                        guidedSummary={guidedSummary}
                        previewQueryText={previewQueryText}
                        previewRows={previewRows}
                        previewError={previewError}
                        previewLoading={previewLoading}
                        chartError={chartError}
                        isEditing={Boolean(editingChartId)}
                        onModeChange={setChartMode}
                        onChartChange={updateChartDraft}
                        onGuidedConfigChange={updateGuidedConfig}
                        onApplyTemplate={handleApplyTemplate}
                        onPreview={handlePreviewChart}
                        onSave={handleSaveChart}
                        onCancel={closeChartBuilder}
                    />
                )}
                <MonitorChartGrid
                    charts={charts}
                    dataByChartId={chartData}
                    errorsByChartId={chartErrors}
                    loading={chartLoading}
                    onEdit={handleEditChart}
                    onDelete={handleDeleteChart}
                />

            </div>
        </div>
    );
};

export default Dashboard;
