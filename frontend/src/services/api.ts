import { Project, Trace } from '../types';

const API_BASE_URL = 'http://localhost:8000';

export interface View {
    id: string;
    project_id: string;
    name: string;
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
        filters?: { status?: string, search?: string, limit?: number }
    ): Promise<Trace[]> => {
        const params = new URLSearchParams();
        if (filters?.status && filters.status !== 'all') params.append('status', filters.status);
        if (filters?.search) params.append('search', filters.search);
        if (filters?.limit) params.append('limit', filters.limit.toString());

        const response = await fetch(`${API_BASE_URL}/projects/${projectId}/traces?${params.toString()}`);
        if (!response.ok) throw new Error('Failed to fetch traces');
        return response.json();
    },

    getViews: async (projectId: string): Promise<View[]> => {
        const response = await fetch(`${API_BASE_URL}/views/${projectId}`);
        if (!response.ok) throw new Error('Failed to fetch views');
        return response.json();
    },

    createView: async (view: { project_id: string, name: string, config: any }): Promise<View> => {
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

    // Logs (first-class, separate from traces)
    getLogs: async (
        projectId: string,
        filters?: { level?: string; trace_id?: string; search?: string; limit?: number; offset?: number }
    ): Promise<any[]> => {
        const params = new URLSearchParams();
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

    // Datasets
    getDatasets: async (projectId: string): Promise<any[]> => {
        const response = await fetch(`${API_BASE_URL}/datasets/?project_id=${projectId}`);
        if (!response.ok) throw new Error('Failed to fetch datasets');
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

    getDatasetRows: async (datasetId: string): Promise<any[]> => {
        const response = await fetch(`${API_BASE_URL}/datasets/${datasetId}/rows`);
        if (!response.ok) throw new Error('Failed to fetch dataset rows');
        return response.json();
    },

    promoteToDataset: async (traceId: string, datasetId: string): Promise<any> => {
        const response = await fetch(`${API_BASE_URL}/datasets/promote?trace_id=${traceId}&dataset_id=${datasetId}`, {
            method: 'POST',
        });
        if (!response.ok) throw new Error('Failed to promote trace to dataset');
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
        payload: { parent_version_id?: string; model_registry_id: string; temperature?: number; max_tokens?: number; system_prompt?: string; notes?: string }
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
