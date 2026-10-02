import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { getErrorMessage } from '../../lib/errors';
import type { MonitorChart } from '../../types';
import { buildDashboardLogsQuery, parseDashboardLogRows } from './metrics';
import type { ChartRow, DashboardLogRow } from './metrics';

export interface DashboardDataState {
    logs: DashboardLogRow[];
    loading: boolean;
    logsError: string | null;
    charts: MonitorChart[];
    chartsError: string | null;
    chartData: Record<string, ChartRow[]>;
    chartErrors: Record<string, string>;
    chartLoading: boolean;
    refreshCharts: () => Promise<void>;
    deleteChart: (chartId: string) => Promise<void>;
}

export function useDashboardData(projectId: string): DashboardDataState {
    const [logs, setLogs] = useState<DashboardLogRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [logsError, setLogsError] = useState<string | null>(null);
    const [charts, setCharts] = useState<MonitorChart[]>([]);
    const [chartsError, setChartsError] = useState<string | null>(null);
    const [chartData, setChartData] = useState<Record<string, ChartRow[]>>({});
    const [chartErrors, setChartErrors] = useState<Record<string, string>>({});
    const [chartLoading, setChartLoading] = useState(false);

    useEffect(() => {
        if (!projectId) {
            setLogs([]);
            setLoading(false);
            setLogsError(null);
            return;
        }

        let active = true;
        setLoading(true);
        setLogsError(null);

        const fetchLogs = async () => {
            try {
                const query = buildDashboardLogsQuery(projectId);
                const result = await api.runAqlQuery(query);
                if (active) setLogs(parseDashboardLogRows(result.data));
            } catch (cause: unknown) {
                if (!active) return;
                setLogs([]);
                setLogsError(getErrorMessage(cause, 'Unable to load dashboard metrics.'));
            } finally {
                if (active) setLoading(false);
            }
        };

        void fetchLogs();
        return () => {
            active = false;
        };
    }, [projectId]);

    const refreshCharts = useCallback(async () => {
        if (!projectId) {
            setCharts([]);
            setChartsError(null);
            return;
        }

        setChartsError(null);
        try {
            const result = await api.getCharts(projectId);
            setCharts(result);
        } catch (cause: unknown) {
            setCharts([]);
            setChartsError(getErrorMessage(cause, 'Unable to load saved charts.'));
        }
    }, [projectId]);

    useEffect(() => {
        void refreshCharts();
    }, [refreshCharts]);

    useEffect(() => {
        if (charts.length === 0) {
            setChartData({});
            setChartErrors({});
            setChartLoading(false);
            return;
        }

        let active = true;
        setChartLoading(true);
        const nextData: Record<string, ChartRow[]> = {};
        const nextErrors: Record<string, string> = {};

        const fetchChartData = async () => {
            await Promise.all(
                charts.map(async (chart) => {
                    try {
                        const result = await api.runAqlQuery(chart.query);
                        nextData[chart.id] = result.data || [];
                    } catch (cause: unknown) {
                        nextErrors[chart.id] = getErrorMessage(cause, 'Unable to load this chart.');
                        nextData[chart.id] = [];
                    }
                })
            );

            if (!active) return;
            setChartData(nextData);
            setChartErrors(nextErrors);
            setChartLoading(false);
        };

        void fetchChartData();
        return () => {
            active = false;
        };
    }, [charts]);

    const deleteChart = useCallback(async (chartId: string) => {
        setChartsError(null);
        try {
            await api.deleteChart(chartId);
            await refreshCharts();
        } catch (cause: unknown) {
            setChartsError(getErrorMessage(cause, 'Unable to delete this chart.'));
        }
    }, [refreshCharts]);

    return {
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
    };
}
