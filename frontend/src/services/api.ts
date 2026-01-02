import { Project, Trace, Log, AqlQueryResponse, AqlQueryRequest, MonitorChart, Playground } from '../types';

const API_BASE_URL = 'http://localhost:8000';

export interface View {
    id: string;
    project_id: string;
    name: string;
    entity_type?: string;
    config: any;
    created_at: number;
}

export const api = {
    getProjects: async (): Promise<Project[]> => {
        const response = await fetch(`${API_BASE_URL}/projects`);
        if (!response.ok) throw new Error('Failed to fetch projects');
        return response.json();
    },

    getProject: async (projectId: string): Promise<Project> => {
        const response = await fetch(`${API_BASE_URL}/projects/${projectId}`);
        if (!response.ok) throw new Error('Failed to fetch project');
        return response.json();
    },

    createProject: async (project: { name: string; org_id?: string }): Promise<Project> => {
        const response = await fetch(`${API_BASE_URL}/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(project),
        });
        if (!response.ok) throw new Error('Failed to create project');
        return response.json();
    },

    updateProject: async (projectId: string, project: { name?: string; org_id?: string }): Promise<Project> => {
        const response = await fetch(`${API_BASE_URL}/projects/${projectId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(project),
        });
        if (!response.ok) throw new Error('Failed to update project');
        return response.json();
    },

    deleteProject: async (projectId: string): Promise<void> => {
        const response = await fetch(`${API_BASE_URL}/projects/${projectId}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Failed to delete project');
    },

    getTraces: async (
        projectId: string,
        filters?: { status?: string, search?: string, limit?: number, parent_trace_id?: string }
    ): Promise<Trace[]> => {
        const params = new URLSearchParams();
        if (filters?.status && filters.status !== 'all') params.append('status', filters.status);
        if (filters?.search) params.append('search', filters.search);
        if (filters?.limit) params.append('limit', filters.limit.toString());
        if (filters?.parent_trace_id) params.append('parent_trace_id', filters.parent_trace_id);

        const response = await fetch(`${API_BASE_URL}/projects/${projectId}/traces?${params.toString()}`);
        if (!response.ok) throw new Error('Failed to fetch traces');
        return response.json();
    },

    getViews: async (projectId: string): Promise<View[]> => {
        const response = await fetch(`${API_BASE_URL}/views/${projectId}`);
        if (!response.ok) throw new Error('Failed to fetch views');
        return response.json();
    },

    createView: async (view: { project_id: string, name: string, entity_type?: string, config: any }): Promise<View> => {
        const response = await fetch(`${API_BASE_URL}/views`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(view),
        });
        if (!response.ok) throw new Error('Failed to create view');
        return response.json();
    },

    deleteView: async (viewId: string): Promise<void> => {
        const response = await fetch(`${API_BASE_URL}/views/${viewId}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Failed to delete view');
    },

    // Playgrounds
    getPlaygrounds: async (
        projectId: string,
        filters?: { search?: string; limit?: number }
    ): Promise<Playground[]> => {
        const params = new URLSearchParams({ project_id: projectId });
        if (filters?.search) params.append('search', filters.search);
        if (filters?.limit) params.append('limit', filters.limit.toString());
        const response = await fetch(`${API_BASE_URL}/playgrounds?${params.toString()}`);
        if (!response.ok) throw new Error('Failed to fetch playgrounds');
        return response.json();
    },

    getPlayground: async (playgroundId: string): Promise<Playground> => {
        const response = await fetch(`${API_BASE_URL}/playgrounds/${playgroundId}`);
        if (!response.ok) throw new Error('Failed to fetch playground');
        return response.json();
    },

    createPlayground: async (payload: {
        project_id: string;
        name: string;
        description?: string;
        config?: Record<string, any>;
    }): Promise<Playground> => {
        const response = await fetch(`${API_BASE_URL}/playgrounds`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error('Failed to create playground');
        return response.json();
    },

    updatePlayground: async (
        playgroundId: string,
        payload: { name?: string; description?: string; config?: Record<string, any> }
    ): Promise<Playground> => {
        const response = await fetch(`${API_BASE_URL}/playgrounds/${playgroundId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error('Failed to update playground');
        return response.json();
    },

    deletePlayground: async (playgroundId: string): Promise<void> => {
        const response = await fetch(`${API_BASE_URL}/playgrounds/${playgroundId}`, {
            method: 'DELETE',
        });
        if (!response.ok) throw new Error('Failed to delete playground');
    },

    // Monitor charts
    getCharts: async (projectId: string): Promise<MonitorChart[]> => {
        const response = await fetch(`${API_BASE_URL}/charts/${projectId}`);
        if (!response.ok) throw new Error('Failed to fetch charts');
        return response.json();
    },

    createChart: async (chart: {
        project_id: string;
        name: string;
        query: string;
        chart_type: string;
        x_field: string;
        y_field: string;
        series_field?: string;
        config?: Record<string, any>;
    }): Promise<MonitorChart> => {
        const response = await fetch(`${API_BASE_URL}/charts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(chart),
        });
        if (!response.ok) throw new Error('Failed to create chart');
        return response.json();
    },

    updateChart: async (chartId: string, updates: {
        name?: string;
        query?: string;
        chart_type?: string;
        x_field?: string;
        y_field?: string;
        series_field?: string | null;
        config?: Record<string, any>;
    }): Promise<MonitorChart> => {
        const response = await fetch(`${API_BASE_URL}/charts/${chartId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates),
        });
        if (!response.ok) throw new Error('Failed to update chart');
        return response.json();
    },

    deleteChart: async (chartId: string): Promise<void> => {
        const response = await fetch(`${API_BASE_URL}/charts/${chartId}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Failed to delete chart');
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

        const response = await fetch(`${API_BASE_URL}/logs/${projectId}?${params.toString()}`);
        if (!response.ok) throw new Error('Failed to fetch logs');
        return response.json();
    },

    createLog: async (log: {
        project_id: string;
        level?: string;
        status?: string;
        event_type?: string;
        message: string;
        timestamp?: number;
        trace_id?: string;
        span_id?: string;
        attributes?: Record<string, any>;
        metadata?: Record<string, any>;
    }): Promise<any> => {
        const response = await fetch(`${API_BASE_URL}/logs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(log),
        });
        if (!response.ok) throw new Error('Failed to create log');
        return response.json();
    },

    createLogsBatch: async (logs: Array<{
        project_id: string;
        level?: string;
        status?: string;
        event_type?: string;
        message: string;
        timestamp?: number;
        trace_id?: string;
        span_id?: string;
        attributes?: Record<string, any>;
        metadata?: Record<string, any>;
    }>): Promise<{ status: string; count: number; log_ids: string[] }> => {
        const response = await fetch(`${API_BASE_URL}/logs/batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ logs }),
        });
        if (!response.ok) throw new Error('Failed to create logs batch');
        return response.json();
    },

    deleteLog: async (logId: string): Promise<void> => {
        const response = await fetch(`${API_BASE_URL}/logs/id/${logId}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Failed to delete log');
    },

    // AQL
    runAqlQuery: async (payload: string | AqlQueryRequest): Promise<AqlQueryResponse> => {
        const body = typeof payload === 'string' ? { query: payload } : payload;
        const response = await fetch(`${API_BASE_URL}/aql/query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!response.ok) throw new Error('Failed to run AQL query');
        return response.json();
    },

    // Datasets
    getDatasets: async (projectId: string): Promise<any[]> => {
        const response = await fetch(`${API_BASE_URL}/datasets/?project_id=${projectId}`);
        if (!response.ok) throw new Error('Failed to fetch datasets');
        return response.json();
    },

    getDataset: async (datasetId: string): Promise<any> => {
        const response = await fetch(`${API_BASE_URL}/datasets/${datasetId}`);
        if (!response.ok) throw new Error('Failed to fetch dataset');
        return response.json();
    },

    createDataset: async (dataset: any): Promise<any> => {
        const response = await fetch(`${API_BASE_URL}/datasets/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dataset),
        });
        if (!response.ok) throw new Error('Failed to create dataset');
        return response.json();
    },

    getDatasetRows: async (
        datasetId: string,
        filters?: { row_kind?: string; eval_label?: string; at_version?: number }
    ): Promise<any[]> => {
        const params = new URLSearchParams();
        if (filters?.row_kind) params.append('row_kind', filters.row_kind);
        if (filters?.eval_label) params.append('eval_label', filters.eval_label);
        if (filters?.at_version !== undefined) params.append('at_version', String(filters.at_version));
        const query = params.toString();
        const response = await fetch(`${API_BASE_URL}/datasets/${datasetId}/rows${query ? `?${query}` : ''}`);
        if (!response.ok) throw new Error('Failed to fetch dataset rows');
        return response.json();
    },

    getDatasetHistory: async (datasetId: string): Promise<any[]> => {
        const response = await fetch(`${API_BASE_URL}/datasets/${datasetId}/history`);
        if (!response.ok) throw new Error('Failed to fetch dataset history');
        return response.json();
    },

    getDatasetRowHistory: async (datasetId: string, logicalId: string): Promise<any[]> => {
        const response = await fetch(`${API_BASE_URL}/datasets/${datasetId}/rows/${logicalId}/history`);
        if (!response.ok) throw new Error('Failed to fetch dataset row history');
        return response.json();
    },

    addDatasetRow: async (datasetId: string, row: {
        input: any;
        expected: any;
        example_type?: string;  // "gold" or "anti_pattern"
        row_kind?: string;
        eval_label?: string;
        meta?: any;
    }): Promise<any> => {
        const response = await fetch(`${API_BASE_URL}/datasets/${datasetId}/rows`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(row),
        });
        if (!response.ok) throw new Error('Failed to add dataset row');
        return response.json();
    },

    updateDatasetRow: async (
        datasetId: string,
        rowId: string,
        updates: {
            input?: any;
            expected?: any;
            example_type?: string;
            row_kind?: string;
            eval_label?: string;
            meta?: any;
            is_deleted?: boolean;
            reason?: string;
        }
    ): Promise<any> => {
        const response = await fetch(`${API_BASE_URL}/datasets/${datasetId}/rows/${rowId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates),
        });
        if (!response.ok) throw new Error('Failed to update dataset row');
        return response.json();
    },

    deleteDatasetRow: async (datasetId: string, rowId: string, reason?: string): Promise<any> => {
        const params = reason ? `?reason=${encodeURIComponent(reason)}` : '';
        const response = await fetch(`${API_BASE_URL}/datasets/${datasetId}/rows/${rowId}${params}`, {
            method: 'DELETE',
        });
        if (!response.ok) throw new Error('Failed to delete dataset row');
        return response.json();
    },

    flushDataset: async (datasetId: string, reason?: string): Promise<any> => {
        const params = reason ? `?reason=${encodeURIComponent(reason)}` : '';
        const response = await fetch(`${API_BASE_URL}/datasets/${datasetId}/flush${params}`, {
            method: 'POST',
        });
        if (!response.ok) throw new Error('Failed to flush dataset');
        return response.json();
    },

    promoteToDataset: async (
        traceId: string,
        datasetId: string,
        options?: {
            corrected_expected?: any;
            example_type?: string;  // "gold" or "anti_pattern"
            row_kind?: string;
            eval_label?: string;
        }
    ): Promise<any> => {
        const params = new URLSearchParams({ trace_id: traceId, dataset_id: datasetId });
        const response = await fetch(`${API_BASE_URL}/datasets/promote?${params.toString()}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: options
                ? JSON.stringify({
                    corrected_expected: options.corrected_expected,
                    example_type: options.example_type,
                    row_kind: options.row_kind,
                    eval_label: options.eval_label,
                })
                : undefined,
        });
        if (!response.ok) throw new Error('Failed to promote trace to dataset');
        return response.json();
    },

    // Attachments
    listAttachments: async (filters: { object_type?: string; object_id?: string; project_id?: string }): Promise<any[]> => {
        const params = new URLSearchParams();
        if (filters.object_type) params.append('object_type', filters.object_type);
        if (filters.object_id) params.append('object_id', filters.object_id);
        if (filters.project_id) params.append('project_id', filters.project_id);
        const response = await fetch(`${API_BASE_URL}/attachments?${params.toString()}`);
        if (!response.ok) throw new Error('Failed to fetch attachments');
        return response.json();
    },

    createAttachment: async (payload: {
        org_id?: string;
        project_id?: string;
        object_type: string;
        object_id: string;
        kind?: string;
        url: string;
        content_type?: string;
        size_bytes?: number;
        label?: string;
        meta?: any;
    }): Promise<any> => {
        const response = await fetch(`${API_BASE_URL}/attachments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error('Failed to create attachment');
        return response.json();
    },

    deleteAttachment: async (attachmentId: string): Promise<any> => {
        const response = await fetch(`${API_BASE_URL}/attachments/${attachmentId}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Failed to delete attachment');
        return response.json();
    },

    // Assignments
    listAssignments: async (filters: { object_type?: string; object_id?: string; project_id?: string; assignee?: string; status?: string }): Promise<any[]> => {
        const params = new URLSearchParams();
        if (filters.object_type) params.append('object_type', filters.object_type);
        if (filters.object_id) params.append('object_id', filters.object_id);
        if (filters.project_id) params.append('project_id', filters.project_id);
        if (filters.assignee) params.append('assignee', filters.assignee);
        if (filters.status) params.append('status', filters.status);
        const response = await fetch(`${API_BASE_URL}/assignments?${params.toString()}`);
        if (!response.ok) throw new Error('Failed to fetch assignments');
        return response.json();
    },

    createAssignment: async (payload: {
        org_id?: string;
        project_id?: string;
        object_type: string;
        object_id: string;
        assignee: string;
        status?: string;
        note?: string;
    }): Promise<any> => {
        const response = await fetch(`${API_BASE_URL}/assignments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error('Failed to create assignment');
        return response.json();
    },

    updateAssignment: async (assignmentId: string, payload: { assignee?: string; status?: string; note?: string }): Promise<any> => {
        const response = await fetch(`${API_BASE_URL}/assignments/${assignmentId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error('Failed to update assignment');
        return response.json();
    },

    deleteAssignment: async (assignmentId: string): Promise<any> => {
        const response = await fetch(`${API_BASE_URL}/assignments/${assignmentId}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Failed to delete assignment');
        return response.json();
    },

    // Mentions
    listMentions: async (filters: { object_type?: string; object_id?: string; project_id?: string; mentioned?: string }): Promise<any[]> => {
        const params = new URLSearchParams();
        if (filters.object_type) params.append('object_type', filters.object_type);
        if (filters.object_id) params.append('object_id', filters.object_id);
        if (filters.project_id) params.append('project_id', filters.project_id);
        if (filters.mentioned) params.append('mentioned', filters.mentioned);
        const response = await fetch(`${API_BASE_URL}/mentions?${params.toString()}`);
        if (!response.ok) throw new Error('Failed to fetch mentions');
        return response.json();
    },

    createMention: async (payload: {
        org_id?: string;
        project_id?: string;
        object_type: string;
        object_id: string;
        mentioned: string;
        note?: string;
    }): Promise<any> => {
        const response = await fetch(`${API_BASE_URL}/mentions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error('Failed to create mention');
        return response.json();
    },

    deleteMention: async (mentionId: string): Promise<any> => {
        const response = await fetch(`${API_BASE_URL}/mentions/${mentionId}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Failed to delete mention');
        return response.json();
    },

    // Share links
    listShareLinks: async (filters: { object_type?: string; object_id?: string; project_id?: string }): Promise<any[]> => {
        const params = new URLSearchParams();
        if (filters.object_type) params.append('object_type', filters.object_type);
        if (filters.object_id) params.append('object_id', filters.object_id);
        if (filters.project_id) params.append('project_id', filters.project_id);
        const response = await fetch(`${API_BASE_URL}/share-links?${params.toString()}`);
        if (!response.ok) throw new Error('Failed to fetch share links');
        return response.json();
    },

    createShareLink: async (payload: { org_id?: string; project_id?: string; object_type: string; object_id: string; expires_at?: number }): Promise<any> => {
        const response = await fetch(`${API_BASE_URL}/share-links`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error('Failed to create share link');
        return response.json();
    },

    getShareLink: async (token: string): Promise<any> => {
        const response = await fetch(`${API_BASE_URL}/share-links/${token}`);
        if (!response.ok) throw new Error('Failed to fetch share link');
        return response.json();
    },

    revokeShareLink: async (token: string): Promise<any> => {
        const response = await fetch(`${API_BASE_URL}/share-links/${token}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Failed to revoke share link');
        return response.json();
    },

    // Review queue
    getReviews: async (
        projectId: string,
        filters?: { status?: string; source_type?: string; limit?: number; offset?: number }
    ): Promise<any[]> => {
        const params = new URLSearchParams({ project_id: projectId });
        if (filters?.status) params.append('status', filters.status);
        if (filters?.source_type) params.append('source_type', filters.source_type);
        if (filters?.limit !== undefined) params.append('limit', filters.limit.toString());
        if (filters?.offset !== undefined) params.append('offset', filters.offset.toString());
        const response = await fetch(`${API_BASE_URL}/reviews?${params.toString()}`);
        if (!response.ok) throw new Error('Failed to fetch reviews');
        return response.json();
    },

    createReviewFromTrace: async (payload: {
        trace_id: string;
        project_id?: string;
        priority?: number;
        labels?: string[];
        notes?: string;
    }): Promise<any> => {
        const response = await fetch(`${API_BASE_URL}/reviews/from-trace`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error('Failed to create review from trace');
        return response.json();
    },

    updateReview: async (reviewId: string, payload: {
        status?: string;
        priority?: number;
        labels?: string[];
        score?: number;
        notes?: string;
        meta?: any;
    }): Promise<any> => {
        const response = await fetch(`${API_BASE_URL}/reviews/${reviewId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error('Failed to update review');
        return response.json();
    },

    promoteReviewToDataset: async (reviewId: string, payload: {
        dataset_id: string;
        corrected_expected?: any;
        example_type?: string;
        row_kind?: string;
        eval_label?: string;
    }): Promise<any> => {
        const response = await fetch(`${API_BASE_URL}/reviews/${reviewId}/promote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error('Failed to promote review to dataset');
        return response.json();
    },

    // Experiments
    getExperiments: async (projectId: string): Promise<any[]> => {
        const response = await fetch(`${API_BASE_URL}/experiments/?project_id=${projectId}`);
        if (!response.ok) throw new Error('Failed to fetch experiments');
        return response.json();
    },

    createExperiment: async (experiment: any): Promise<any> => {
        const response = await fetch(`${API_BASE_URL}/experiments/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(experiment),
        });
        if (!response.ok) throw new Error('Failed to create experiment');
        return response.json();
    },

    getExperimentResults: async (experimentId: string): Promise<any[]> => {
        const response = await fetch(`${API_BASE_URL}/experiments/${experimentId}/results`);
        if (!response.ok) throw new Error('Failed to fetch experiment results');
        return response.json();
    },

    compareExperimentRuns: async (
        experimentId: string,
        baselineRunId: string,
        candidateRunId: string
    ): Promise<any> => {
        const params = new URLSearchParams({
            baseline_run_id: baselineRunId,
            candidate_run_id: candidateRunId,
        });
        const response = await fetch(`${API_BASE_URL}/experiments/${experimentId}/compare?${params.toString()}`);
        if (!response.ok) throw new Error('Failed to compare runs');
        return response.json();
    },

    getExperiment: async (experimentId: string): Promise<any> => {
        const response = await fetch(`${API_BASE_URL}/experiments/${experimentId}`);
        if (!response.ok) throw new Error('Failed to fetch experiment');
        return response.json();
    },

    runExperiment: async (
        experimentId: string,
        payload: { model: string; provider?: string; temperature?: number; max_tokens?: number; system_prompt?: string; clear_existing?: boolean }
    ): Promise<any> => {
        const response = await fetch(`${API_BASE_URL}/experiments/${experimentId}/run`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error('Failed to run experiment');
        return response.json();
    },

    // Models registry (curated list used by UI)
    getModelRegistry: async (enabledOnly: boolean = true): Promise<any[]> => {
        const response = await fetch(`${API_BASE_URL}/models?enabled_only=${enabledOnly ? 'true' : 'false'}`);
        if (!response.ok) throw new Error('Failed to fetch model registry');
        return response.json();
    },

    createModelRegistryEntry: async (payload: { provider: string; model_id: string; display_name?: string; enabled?: boolean }): Promise<any> => {
        const response = await fetch(`${API_BASE_URL}/models`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error('Failed to create model');
        return response.json();
    },

    syncModelRegistry: async (payload: { provider?: string; enable_new?: boolean } = {}): Promise<any[]> => {
        const response = await fetch(`${API_BASE_URL}/models/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error('Failed to sync models');
        return response.json();
    },

    updateModelRegistryEntry: async (id: string, payload: { enabled?: boolean; display_name?: string }): Promise<any> => {
        const response = await fetch(`${API_BASE_URL}/models/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error('Failed to update model');
        return response.json();
    },

    getProviderStatuses: async (): Promise<any[]> => {
        const response = await fetch(`${API_BASE_URL}/providers`);
        if (!response.ok) throw new Error('Failed to fetch providers');
        return response.json();
    },

    setProviderApiKey: async (provider: string, api_key: string): Promise<any> => {
        const response = await fetch(`${API_BASE_URL}/providers/${provider}/apikey`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key }),
        });
        if (!response.ok) throw new Error('Failed to set api key');
        return response.json();
    },

    clearProviderApiKey: async (provider: string): Promise<any> => {
        const response = await fetch(`${API_BASE_URL}/providers/${provider}/apikey`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Failed to clear api key');
        return response.json();
    },

    // Experiments v2 (versions + runs)
    getExperimentVersions: async (experimentId: string): Promise<any[]> => {
        const response = await fetch(`${API_BASE_URL}/experiments/${experimentId}/versions`);
        if (!response.ok) throw new Error('Failed to fetch experiment versions');
        return response.json();
    },

    createExperimentVersion: async (
        experimentId: string,
        payload: {
            parent_version_id?: string;
            model_registry_id: string;
            // Core inference params
            temperature?: number;
            max_tokens?: number;
            top_p?: number;
            frequency_penalty?: number;
            presence_penalty?: number;
            stop_sequences?: string[];
            // Prompt config
            system_prompt?: string;
            prompt_template?: string;
            // Advanced
            reasoning_effort?: string;
            json_mode?: boolean;
            seed?: number;
            // Scorers
            scorers?: string[];
            // Metadata
            notes?: string;
        }
    ): Promise<any> => {
        const response = await fetch(`${API_BASE_URL}/experiments/${experimentId}/versions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error('Failed to create experiment version');
        return response.json();
    },

    setExperimentMainVersion: async (experimentId: string, versionId: string): Promise<any> => {
        const response = await fetch(`${API_BASE_URL}/experiments/${experimentId}/main?version_id=${encodeURIComponent(versionId)}`, {
            method: 'POST',
        });
        if (!response.ok) throw new Error('Failed to set main version');
        return response.json();
    },

    getVersionRuns: async (experimentId: string, versionId: string): Promise<any[]> => {
        const response = await fetch(`${API_BASE_URL}/experiments/${experimentId}/versions/${versionId}/runs`);
        if (!response.ok) throw new Error('Failed to fetch runs');
        return response.json();
    },

    createVersionRun: async (experimentId: string, versionId: string): Promise<any> => {
        const response = await fetch(`${API_BASE_URL}/experiments/${experimentId}/versions/${versionId}/runs`, {
            method: 'POST',
        });
        if (!response.ok) throw new Error('Failed to create run');
        return response.json();
    },

    getRun: async (runId: string): Promise<any> => {
        const response = await fetch(`${API_BASE_URL}/experiments/runs/${runId}`);
        if (!response.ok) throw new Error('Failed to fetch run');
        return response.json();
    },

    cancelRun: async (runId: string): Promise<any> => {
        const response = await fetch(`${API_BASE_URL}/experiments/runs/${runId}/cancel`, { method: 'POST' });
        if (!response.ok) throw new Error('Failed to cancel run');
        return response.json();
    },

    getRunResults: async (runId: string): Promise<any[]> => {
        const response = await fetch(`${API_BASE_URL}/experiments/runs/${runId}/results`);
        if (!response.ok) throw new Error('Failed to fetch run results');
        return response.json();
    },

    // Functions/Scorers Registry
    getScorers: async (projectId?: string): Promise<any[]> => {
        const params = projectId ? `?project_id=${projectId}` : '';
        const response = await fetch(`${API_BASE_URL}/functions/scorers${params}`);
        if (!response.ok) throw new Error('Failed to fetch scorers');
        return response.json();
    },

    seedBuiltinScorers: async (): Promise<any> => {
        const response = await fetch(`${API_BASE_URL}/functions/seed-builtins`, { method: 'POST' });
        if (!response.ok) throw new Error('Failed to seed builtin scorers');
        return response.json();
    },

    // Guardrails
    getGuardrails: async (projectId: string): Promise<any[]> => {
        const response = await fetch(`${API_BASE_URL}/guardrails/?project_id=${projectId}`);
        if (!response.ok) throw new Error('Failed to fetch guardrails');
        return response.json();
    },

    createGuardrail: async (guardrail: any): Promise<any> => {
        const response = await fetch(`${API_BASE_URL}/guardrails/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(guardrail),
        });
        if (!response.ok) throw new Error('Failed to create guardrail');
        return response.json();
    },

    updateGuardrail: async (guardrailId: string, updates: { enabled?: boolean; action?: string }): Promise<any> => {
        const params = new URLSearchParams();
        if (updates.enabled !== undefined) params.append('enabled', String(updates.enabled));
        if (updates.action) params.append('action', updates.action);

        const response = await fetch(`${API_BASE_URL}/guardrails/${guardrailId}?${params.toString()}`, {
            method: 'PATCH',
        });
        if (!response.ok) throw new Error('Failed to update guardrail');
        return response.json();
    },

    deleteGuardrail: async (guardrailId: string): Promise<any> => {
        const response = await fetch(`${API_BASE_URL}/guardrails/${guardrailId}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Failed to delete guardrail');
        return response.json();
    },

    createGuardrailFromAntiPattern: async (
        projectId: string,
        patternId: string,
        name: string,
        action: string = "warn"
    ): Promise<any> => {
        const params = new URLSearchParams({
            project_id: projectId,
            pattern_id: patternId,
            name,
            action,
        });
        const response = await fetch(`${API_BASE_URL}/guardrails/from-anti-pattern?${params.toString()}`, {
            method: 'POST',
        });
        if (!response.ok) throw new Error('Failed to create guardrail from anti-pattern');
        return response.json();
    },
};

// Deprecated standalone functions if used elsewhere, or update them to use api object. 
// For now, let's keep the existing exports to avoid breaking other files, 
// but we should check if they are used. 
// The previous file had: export async function fetchProjects...
// Let's re-export them for compatibility or just switch to the new 'api' object.
// I'll keep the old functions for now but impl via api object to be safe.

export async function fetchProjects(): Promise<Project[]> {
    return api.getProjects();
}

export async function fetchTraces(projectId: string): Promise<Trace[]> {
    return api.getTraces(projectId);
}
