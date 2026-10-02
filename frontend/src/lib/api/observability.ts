import { API_BASE_URL, requestJson, requestVoid } from './base';
import type { Log, LogCreateInput, AqlQueryResponse, AqlQueryRequest, MonitorChart, SearchDocsResponse } from '../../types';

export const observabilityApi = {
    // Monitor charts
    getCharts: async (projectId: string): Promise<MonitorChart[]> => {
        return requestJson<MonitorChart[]>(`${API_BASE_URL}/charts/${projectId}`, 'Failed to fetch charts');
    },

    createChart: async (chart: {
        project_id: string;
        name: string;
        query: string;
        chart_type: string;
        x_field: string;
        y_field: string;
        series_field?: string;
        config?: Record<string, unknown>;
    }): Promise<MonitorChart> => {
        return requestJson<MonitorChart>(`${API_BASE_URL}/charts`, 'Failed to create chart', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(chart),
        });
    },

    updateChart: async (chartId: string, updates: {
        name?: string;
        query?: string;
        chart_type?: string;
        x_field?: string;
        y_field?: string;
        series_field?: string | null;
        config?: Record<string, unknown>;
    }): Promise<MonitorChart> => {
        return requestJson<MonitorChart>(`${API_BASE_URL}/charts/${chartId}`, 'Failed to update chart', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates),
        });
    },

    deleteChart: async (chartId: string): Promise<void> => {
        await requestVoid(`${API_BASE_URL}/charts/${chartId}`, 'Failed to delete chart', { method: 'DELETE' });
    },

    // Logs (first-class, separate from traces)
    getLogs: async (
        projectId: string,
        filters?: { status?: string; event_type?: string; level?: string; trace_id?: string; search?: string; limit?: number; offset?: number }
    ): Promise<Log[]> => {
        const params = new URLSearchParams();
        if (filters?.status) params.append('status', filters.status);
        if (filters?.event_type) params.append('event_type', filters.event_type);
        if (filters?.level) params.append('level', filters.level);
        if (filters?.trace_id) params.append('trace_id', filters.trace_id);
        if (filters?.search) params.append('search', filters.search);
        if (filters?.limit) params.append('limit', filters.limit.toString());
        if (filters?.offset) params.append('offset', filters.offset.toString());

        return requestJson<Log[]>(`${API_BASE_URL}/logs/${projectId}?${params.toString()}`, 'Failed to fetch logs');
    },

    getLog: async (logId: string): Promise<Log> => {
        return requestJson<Log>(`${API_BASE_URL}/logs/id/${logId}`, 'Failed to fetch log');
    },

    createLog: async (log: LogCreateInput): Promise<Log> => {
        return requestJson<Log>(`${API_BASE_URL}/logs`, 'Failed to create log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(log),
        });
    },

    createLogsBatch: async (logs: LogCreateInput[]): Promise<{ status: string; count: number; log_ids: string[] }> => {
        return requestJson<{ status: string; count: number; log_ids: string[] }>(
            `${API_BASE_URL}/logs/batch`,
            'Failed to create logs batch',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ logs }),
            }
        );
    },

    deleteLog: async (logId: string): Promise<void> => {
        await requestVoid(`${API_BASE_URL}/logs/id/${logId}`, 'Failed to delete log', { method: 'DELETE' });
    },

    // AQL
    runAqlQuery: async (payload: string | AqlQueryRequest): Promise<AqlQueryResponse> => {
        const body = typeof payload === 'string' ? { query: payload } : payload;
        return requestJson<AqlQueryResponse>(`${API_BASE_URL}/aql/query`, 'Failed to run AQL query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    },

    // Owl utilities
    searchDocs: async (payload: { query: string; limit?: number }): Promise<SearchDocsResponse> => {
        return requestJson<SearchDocsResponse>(`${API_BASE_URL}/owl/search-docs`, 'Failed to search docs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    },
};
