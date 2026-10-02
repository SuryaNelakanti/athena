import { API_BASE_URL, requestJson, requestVoid } from './base';
import type { Organization, Project, Trace } from '../../types';

export const coreApi = {
    getOrganizations: async (): Promise<Organization[]> => {
        return requestJson<Organization[]>(`${API_BASE_URL}/organizations`, 'Failed to fetch organizations');
    },

    createOrganization: async (org: { name: string; description?: string | null }): Promise<Organization> => {
        return requestJson<Organization>(`${API_BASE_URL}/organizations`, 'Failed to create organization', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(org),
        });
    },

    getProjects: async (): Promise<Project[]> => {
        return requestJson<Project[]>(`${API_BASE_URL}/projects`, 'Failed to fetch projects');
    },

    getProject: async (projectId: string): Promise<Project> => {
        return requestJson<Project>(`${API_BASE_URL}/projects/${projectId}`, 'Failed to fetch project');
    },

    createProject: async (project: { name: string; org_id?: string }): Promise<Project> => {
        return requestJson<Project>(`${API_BASE_URL}/projects`, 'Failed to create project', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(project),
        });
    },

    updateProject: async (projectId: string, project: { name?: string; org_id?: string }): Promise<Project> => {
        return requestJson<Project>(`${API_BASE_URL}/projects/${projectId}`, 'Failed to update project', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(project),
        });
    },

    deleteProject: async (projectId: string): Promise<void> => {
        await requestVoid(`${API_BASE_URL}/projects/${projectId}`, 'Failed to delete project', { method: 'DELETE' });
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

        return requestJson<Trace[]>(
            `${API_BASE_URL}/projects/${projectId}/traces?${params.toString()}`,
            'Failed to fetch traces'
        );
    },

    getTrace: async (traceId: string): Promise<Trace> => {
        return requestJson<Trace>(`${API_BASE_URL}/traces/${traceId}`, 'Failed to fetch trace');
    },
};
