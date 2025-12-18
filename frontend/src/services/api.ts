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
