import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { getErrorMessage } from '../../lib/errors';
import type { AqlBuilder, AqlFilter, MonitorChart } from '../../types';
import {
    CHART_TEMPLATES,
    GUIDED_AXIS_FIELDS,
    GUIDED_BREAKDOWN_FIELDS,
    GUIDED_DEFAULTS,
    GUIDED_METRICS,
    GUIDED_PROVIDER_FILTERS,
    GUIDED_STATUS_FILTERS,
    GUIDED_TIME_RANGES,
    buildAqlFromBuilder,
    parseGuidedConfig,
} from './aql';
import type { ChartDraft, ChartMode, GuidedChartConfig } from './aql';
import type { ChartRow } from './metrics';
import { useDashboardChartPreview } from './useDashboardChartPreview';

export interface DashboardChartBuilderState {
    showChartBuilder: boolean;
    editingChartId: string | null;
    chartError: string | null;
    chartMode: ChartMode;
    guidedConfig: GuidedChartConfig;
    guidedMetric: (typeof GUIDED_METRICS)[number];
    guidedSummary: string;
    newChart: ChartDraft;
    previewQueryText: string;
    previewRows: ChartRow[];
    previewError: string | null;
    previewLoading: boolean;
    setChartMode: (mode: ChartMode) => void;
    openChartBuilder: () => void;
    closeChartBuilder: () => void;
    handleEditChart: (chart: MonitorChart) => void;
    handleSaveChart: () => Promise<void>;
    handlePreviewChart: () => Promise<void>;
    handleApplyTemplate: (template: (typeof CHART_TEMPLATES)[number]) => void;
    updateChartDraft: (changes: Partial<ChartDraft>) => void;
    updateGuidedConfig: (changes: Partial<GuidedChartConfig>) => void;
}

interface UseDashboardChartBuilderOptions {
    projectId: string;
    refreshCharts: () => Promise<void>;
}

export function useDashboardChartBuilder({ projectId, refreshCharts }: UseDashboardChartBuilderOptions): DashboardChartBuilderState {
    const [showChartBuilder, setShowChartBuilder] = useState(false);
    const [editingChartId, setEditingChartId] = useState<string | null>(null);
    const [chartError, setChartError] = useState<string | null>(null);
    const [chartMode, setChartMode] = useState<ChartMode>('guided');
    const [guidedConfig, setGuidedConfig] = useState<GuidedChartConfig>({ ...GUIDED_DEFAULTS });
    const [newChart, setNewChart] = useState<ChartDraft>({
        name: '',
        query: '',
        chart_type: 'line',
        x_field: 'timestamp',
        y_field: 'total_tokens',
        series_field: '',
    });

    const guidedMetric = useMemo(
        () => GUIDED_METRICS.find((metric) => metric.id === guidedConfig.metric) || GUIDED_METRICS[0],
        [guidedConfig.metric]
    );

    const guidedBuilder = useMemo<AqlBuilder>(() => {
        const filters: AqlFilter[] = [];
        const range = GUIDED_TIME_RANGES.find((option) => option.id === guidedConfig.timeRange);
        if (range?.ms) {
            filters.push({ field: 'timestamp', op: '>=', value: `now() - ${range.ms}` });
        }
        if (guidedConfig.statusFilter !== 'all') {
            filters.push({ field: 'status', op: '=', value: guidedConfig.statusFilter });
        }
        if (guidedConfig.providerFilter !== 'all') {
            filters.push({ field: 'provider', op: '=', value: guidedConfig.providerFilter });
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
            measures: [{ func: guidedMetric.func, field: guidedMetric.field, alias: guidedMetric.alias }],
            sort: { field: guidedConfig.xAxis, direction: 'asc' },
            limit: guidedConfig.limit,
        };
    }, [guidedConfig, guidedMetric, projectId]);

    const guidedQuery = useMemo(
        () => projectId ? buildAqlFromBuilder(guidedBuilder) : '',
        [guidedBuilder, projectId]
    );

    const previewRequestKey = JSON.stringify([
        projectId,
        chartMode,
        chartMode === 'guided' ? guidedBuilder : newChart.query,
    ]);
    const preview = useDashboardChartPreview({
        requestKey: previewRequestKey,
        chartMode,
        guidedBuilder,
        query: newChart.query,
    });

    const guidedSummary = useMemo(() => {
        const range = GUIDED_TIME_RANGES.find((option) => option.id === guidedConfig.timeRange);
        const axisLabel = GUIDED_AXIS_FIELDS.find((field) => field.value === guidedConfig.xAxis)?.label || guidedConfig.xAxis;
        const breakdownLabel = GUIDED_BREAKDOWN_FIELDS.find((field) => field.value === guidedConfig.breakdown)?.label || '';
        const statusLabel = GUIDED_STATUS_FILTERS.find((filter) => filter.value === guidedConfig.statusFilter)?.label || '';
        const providerLabel = GUIDED_PROVIDER_FILTERS.find((filter) => filter.value === guidedConfig.providerFilter)?.label || '';
        const parts = [
            `${guidedMetric.label.toLowerCase()} from logs`,
            range?.id === 'all' ? 'for all time' : `over ${range?.label.toLowerCase()}`,
            `plotted by ${axisLabel.toLowerCase()}`,
        ];
        if (breakdownLabel && breakdownLabel !== 'None') parts.push(`split by ${breakdownLabel.toLowerCase()}`);
        if (statusLabel && statusLabel !== 'All statuses') parts.push(statusLabel.toLowerCase());
        if (providerLabel && providerLabel !== 'All providers') parts.push(providerLabel.toLowerCase());
        return parts.join(', ');
    }, [guidedConfig, guidedMetric]);

    const previewQueryText = useMemo(() => {
        if (preview.previewQuery) return preview.previewQuery;
        return chartMode === 'guided' ? guidedQuery : newChart.query;
    }, [preview.previewQuery, chartMode, guidedQuery, newChart.query]);

    const chartQueryTemplate = () =>
        `from project_logs(project_id="${projectId}") select timestamp, total_tokens sort timestamp asc limit 200`;

    const resetChartForm = () => {
        setEditingChartId(null);
        setChartError(null);
        setChartMode('guided');
        setGuidedConfig({ ...GUIDED_DEFAULTS });
        preview.clearPreview();
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
        setNewChart((previous) => ({
            ...previous,
            x_field: guidedConfig.xAxis,
            y_field: guidedMetric.alias,
            series_field: guidedConfig.breakdown || '',
            query: guidedQuery,
        }));
    }, [chartMode, guidedConfig.xAxis, guidedConfig.breakdown, guidedMetric.alias, guidedQuery]);

    const openChartBuilder = () => {
        resetChartForm();
        setShowChartBuilder(true);
    };

    const closeChartBuilder = () => {
        setShowChartBuilder(false);
        resetChartForm();
    };

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
            let config: Record<string, unknown>;

            if (chartMode === 'guided') {
                query = guidedQuery;
                xField = guidedConfig.xAxis;
                yField = guidedMetric.alias;
                seriesField = guidedConfig.breakdown ? guidedConfig.breakdown : null;
                config = { mode: 'guided', builder: guidedBuilder, ui: guidedConfig };
            } else {
                config = { mode: 'advanced' };
            }

            if (!query.trim()) {
                setChartError('Query cannot be empty.');
                return;
            }

            const chartFields = {
                name: newChart.name,
                query,
                chart_type: newChart.chart_type,
                x_field: xField,
                y_field: yField,
                series_field: seriesField,
                config,
            };
            if (editingChartId) {
                await api.updateChart(editingChartId, chartFields);
            } else {
                await api.createChart({ project_id: projectId, ...chartFields });
            }

            setShowChartBuilder(false);
            resetChartForm();
            await refreshCharts();
        } catch (cause: unknown) {
            setChartError(getErrorMessage(cause, 'Failed to save chart.'));
        }
    };

    const handleEditChart = (chart: MonitorChart) => {
        setEditingChartId(chart.id);
        setChartError(null);
        setShowChartBuilder(true);
        preview.clearPreview();
        const config = chart.config || {};
        if (config.mode === 'guided' && config.ui) {
            setChartMode('guided');
            setGuidedConfig({ ...GUIDED_DEFAULTS, ...parseGuidedConfig(config.ui) });
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

    const handleApplyTemplate = (template: (typeof CHART_TEMPLATES)[number]) => {
        setChartMode('guided');
        setGuidedConfig({ ...GUIDED_DEFAULTS, ...template.guided });
        setNewChart((previous) => ({
            ...previous,
            chart_type: template.chart_type,
            name: previous.name || template.name,
        }));
    };

    const updateChartDraft = (changes: Partial<ChartDraft>) => {
        setNewChart((previous) => ({ ...previous, ...changes }));
    };

    const updateGuidedConfig = (changes: Partial<GuidedChartConfig>) => {
        setGuidedConfig((previous) => ({ ...previous, ...changes }));
    };

    return {
        showChartBuilder,
        editingChartId,
        chartError,
        chartMode,
        guidedConfig,
        guidedMetric,
        guidedSummary,
        newChart,
        previewQueryText,
        previewRows: preview.previewRows,
        previewError: preview.previewError,
        previewLoading: preview.previewLoading,
        setChartMode,
        openChartBuilder,
        closeChartBuilder,
        handleEditChart,
        handleSaveChart,
        handlePreviewChart: preview.handlePreviewChart,
        handleApplyTemplate,
        updateChartDraft,
        updateGuidedConfig,
    };
}
