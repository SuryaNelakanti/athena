import React from 'react';
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { Button, Card } from '../../components/ui';
import type { MonitorChart } from '../../types';
import {
    buildSeriesData,
    formatXAxis,
    SERIES_COLORS,
    type ChartRow,
} from './metrics';

interface MonitorChartGridProps {
    charts: MonitorChart[];
    dataByChartId: Record<string, ChartRow[]>;
    errorsByChartId: Record<string, string>;
    loading: boolean;
    onEdit: (chart: MonitorChart) => void;
    onDelete: (chartId: string) => void;
}

interface ChartScaffoldProps {
    xField: string;
    showBarCursor?: boolean;
}

const ChartScaffold: React.FC<ChartScaffoldProps> = ({ xField, showBarCursor = false }) => (
    <>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-base)" vertical={false} />
        <XAxis
            dataKey={xField}
            stroke="var(--text-muted)"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) => formatXAxis(value, xField)}
        />
        <YAxis stroke="var(--text-muted)" fontSize={10} tickLine={false} axisLine={false} />
        <Tooltip
            {...(showBarCursor ? { cursor: { fill: 'var(--bg-panel-hover)', radius: 8 } } : {})}
            contentStyle={{
                backgroundColor: 'var(--bg-panel)',
                border: '1px solid var(--border-base)',
                borderRadius: '12px',
                color: 'var(--text-main)',
            }}
        />
    </>
);

export const MonitorChartGrid: React.FC<MonitorChartGridProps> = ({
    charts,
    dataByChartId,
    errorsByChartId,
    loading,
    onEdit,
    onDelete,
}) => (
    <div className="grid grid-cols-2 gap-6">
        {charts.length === 0 && (
            <div className="col-span-2 bg-panel border border-border-base rounded-lg p-6 text-center text-text-muted text-sm italic">
                No custom charts yet. Add one to visualize AQL results.
            </div>
        )}
        {charts.map((chart) => {
            const rows = dataByChartId[chart.id] || [];
            const { data, seriesKeys } = buildSeriesData(rows, chart);
            const isEmpty = data.length === 0;
            const chartError = errorsByChartId[chart.id];

            return (
                <Card key={chart.id} className="p-6 flex flex-col">
                    <div className="flex items-start justify-between mb-4">
                        <div>
                            <h3 className="text-text-main text-sm font-bold">{chart.name}</h3>
                            <div className="text-[10px] text-text-muted mt-1 uppercase tracking-widest">{chart.chart_type}</div>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-text-muted">
                            <Button variant="ghost" size="sm" onClick={() => onEdit(chart)}>Edit</Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-rose-500 hover:text-rose-600"
                                onClick={() => onDelete(chart.id)}
                            >
                                Delete
                            </Button>
                        </div>
                    </div>
                    {chartError && (
                        <div className="text-xs text-rose-500 font-bold bg-rose-500/10 rounded-md p-3 mb-3">
                            {chartError}
                        </div>
                    )}
                    {loading && charts.length > 0 && (
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
                                        <ChartScaffold xField={chart.x_field} showBarCursor />
                                        {seriesKeys.map((key, index) => (
                                            <Bar
                                                key={key}
                                                dataKey={key}
                                                fill={SERIES_COLORS[index % SERIES_COLORS.length]}
                                                radius={[6, 6, 0, 0]}
                                                stackId={chart.series_field ? 'stack' : undefined}
                                            />
                                        ))}
                                    </BarChart>
                                ) : chart.chart_type === 'area' ? (
                                    <AreaChart data={data}>
                                        <defs>
                                            {seriesKeys.map((key, index) => (
                                                <linearGradient
                                                    key={key}
                                                    id={`area-${chart.id}-${index}`}
                                                    x1="0"
                                                    y1="0"
                                                    x2="0"
                                                    y2="1"
                                                >
                                                    <stop
                                                        offset="5%"
                                                        stopColor={SERIES_COLORS[index % SERIES_COLORS.length]}
                                                        stopOpacity={0.35}
                                                    />
                                                    <stop
                                                        offset="95%"
                                                        stopColor={SERIES_COLORS[index % SERIES_COLORS.length]}
                                                        stopOpacity={0}
                                                    />
                                                </linearGradient>
                                            ))}
                                        </defs>
                                        <ChartScaffold xField={chart.x_field} />
                                        {seriesKeys.map((key, index) => (
                                            <Area
                                                key={key}
                                                type="monotone"
                                                dataKey={key}
                                                stroke={SERIES_COLORS[index % SERIES_COLORS.length]}
                                                strokeWidth={2}
                                                fillOpacity={1}
                                                fill={`url(#area-${chart.id}-${index})`}
                                            />
                                        ))}
                                    </AreaChart>
                                ) : (
                                    <LineChart data={data}>
                                        <ChartScaffold xField={chart.x_field} />
                                        {seriesKeys.map((key, index) => (
                                            <Line
                                                key={key}
                                                type="monotone"
                                                dataKey={key}
                                                stroke={SERIES_COLORS[index % SERIES_COLORS.length]}
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
);
