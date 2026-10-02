import type { MonitorChart } from '../../types';

export type DashboardLogRow = {
  timestamp?: number;
  latency_ms?: number | null;
  cost?: number | null;
  status?: string;
};

export type ChartRow = Record<string, unknown>;

export type DashboardStats = {
  totalRequests: number;
  avgLatency: number;
  totalCost: number;
  errorRate: number;
};

export const buildDashboardLogsQuery = (projectId: string, now = Date.now()): string => {
  const sinceMs = now - 24 * 60 * 60 * 1000;
  return `from project_logs(project_id="${projectId}") select timestamp, latency_ms, cost, status filter timestamp >= ${sinceMs} sort timestamp asc limit 5000`;
};

const optionalNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

export const parseDashboardLogRows = (rows: Record<string, unknown>[]): DashboardLogRow[] =>
  rows.flatMap((row) => {
    const timestamp = optionalNumber(row.timestamp);
    if (timestamp === undefined) return [];

    return [{
      timestamp,
      latency_ms: optionalNumber(row.latency_ms) ?? null,
      cost: optionalNumber(row.cost) ?? null,
      status: typeof row.status === 'string' ? row.status : undefined,
    }];
  });

export const SERIES_COLORS = [
  'var(--accent-primary)',
  '#3B82F6',
  '#D16A3A',
  '#5B5CE5',
  '#E25778',
];

export const percentile = (values: number[], p: number) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.max(0, Math.ceil(p * (sorted.length - 1)));
  return sorted[idx];
};

export const calculateDashboardStats = (logs: DashboardLogRow[]): DashboardStats => {
  const totalRequests = logs.length;
  const latencies = logs
    .map((log) => log.latency_ms)
    .filter((value): value is number => typeof value === 'number');
  const costs = logs
    .map((log) => log.cost)
    .filter((value): value is number => typeof value === 'number');
  const errorCount = logs.filter((log) => log.status === 'error').length;

  return {
    totalRequests,
    avgLatency: latencies.length
      ? latencies.reduce((sum, latency) => sum + latency, 0) / latencies.length
      : 0,
    totalCost: costs.reduce((sum, cost) => sum + cost, 0),
    errorRate: totalRequests ? (errorCount / totalRequests) * 100 : 0,
  };
};

export const buildRequestChartData = (logs: DashboardLogRow[], now = Date.now()) => {
  const start = new Date(now - 24 * 60 * 60 * 1000);
  start.setMinutes(0, 0, 0);
  const bucketStartMs = start.getTime();
  const buckets: { name: string; requests: number; latencies: number[] }[] = [];

  for (let index = 0; index < 24; index += 1) {
    const timestamp = bucketStartMs + index * 60 * 60 * 1000;
    const name = new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    buckets.push({ name, requests: 0, latencies: [] });
  }

  logs.forEach((log) => {
    const timestamp = log.timestamp;
    if (!timestamp) return;
    const bucketIndex = Math.floor((timestamp - bucketStartMs) / (60 * 60 * 1000));
    if (bucketIndex < 0 || bucketIndex >= buckets.length) return;
    buckets[bucketIndex].requests += 1;
    if (typeof log.latency_ms === 'number') {
      buckets[bucketIndex].latencies.push(log.latency_ms);
    }
  });

  return buckets.map((bucket) => ({
    name: bucket.name,
    requests: bucket.requests,
    latency: percentile(bucket.latencies, 0.95),
  }));
};

export const buildSeriesData = (rows: ChartRow[], chart: MonitorChart) => {
  if (!chart.series_field) {
    return { data: rows, seriesKeys: [chart.y_field] };
  }

  const pivot = new Map<unknown, ChartRow>();
  const seriesKeys = new Set<string>();
  rows.forEach((row) => {
    const xValue = row[chart.x_field];
    const seriesValue = row[chart.series_field as string];
    if (xValue === undefined || seriesValue === undefined) return;

    const entry = pivot.get(xValue) || { [chart.x_field]: xValue };
    entry[String(seriesValue)] = row[chart.y_field];
    pivot.set(xValue, entry);
    seriesKeys.add(String(seriesValue));
  });

  const data = Array.from(pivot.values()).sort((left, right) => {
    const leftValue = left[chart.x_field];
    const rightValue = right[chart.x_field];
    if (typeof leftValue === 'number' && typeof rightValue === 'number') {
      return leftValue - rightValue;
    }
    return String(leftValue).localeCompare(String(rightValue));
  });

  return { data, seriesKeys: Array.from(seriesKeys) };
};

export const formatXAxis = (value: unknown, key: string) => {
  if (typeof value === 'number' && (key.includes('time') || key.includes('timestamp'))) {
    return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return String(value);
};
