import { API_BASE_URL, requestJson, requestVoid } from './base';
import type { AgentSession, AgentSessionDetail, AgentRun, SessionEvent, SessionAnnotation, SessionEval, RunGraph } from '../../types';
import type { View, ViewConfig } from './view';

export const sessionsApi = {
    // Sessions (agent-native)
    getSessions: async (
        projectId: string,
        filters?: {
            agent_name?: string;
            env?: string;
            status?: string;
            start_time?: number;
            end_time?: number;
            limit?: number;
            offset?: number;
        }
    ): Promise<AgentSession[]> => {
        const params = new URLSearchParams({ project_id: projectId });
        if (filters?.agent_name) params.append('agent_name', filters.agent_name);
        if (filters?.env) params.append('env', filters.env);
        if (filters?.status) params.append('status', filters.status);
        if (filters?.start_time) params.append('start_time', filters.start_time.toString());
        if (filters?.end_time) params.append('end_time', filters.end_time.toString());
        if (filters?.limit) params.append('limit', filters.limit.toString());
        if (filters?.offset) params.append('offset', filters.offset.toString());
        return requestJson<AgentSession[]>(
            `${API_BASE_URL}/sessions?${params.toString()}`,
            'Failed to fetch sessions'
        );
    },

    getSession: async (sessionId: string): Promise<AgentSessionDetail> => {
        return requestJson<AgentSessionDetail>(`${API_BASE_URL}/sessions/${sessionId}`, 'Failed to fetch session');
    },

    getRun: async (runId: string): Promise<AgentRun> => {
        return requestJson<AgentRun>(`${API_BASE_URL}/runs/${runId}`, 'Failed to fetch run');
    },

    getRunGraph: async (runId: string): Promise<RunGraph> => {
        return requestJson<RunGraph>(`${API_BASE_URL}/runs/${runId}/graph`, 'Failed to fetch run graph');
    },

    getSessionTimeline: async (
        sessionId: string,
        filters?: { limit?: number; offset?: number }
    ): Promise<SessionEvent[]> => {
        const params = new URLSearchParams();
        if (filters?.limit) params.append('limit', filters.limit.toString());
        if (filters?.offset) params.append('offset', filters.offset.toString());
        return requestJson<SessionEvent[]>(
            `${API_BASE_URL}/sessions/${sessionId}/timeline?${params.toString()}`,
            'Failed to fetch session timeline'
        );
    },

    getSessionAnnotations: async (sessionId: string): Promise<SessionAnnotation[]> => {
        return requestJson<SessionAnnotation[]>(
            `${API_BASE_URL}/sessions/${sessionId}/annotations`,
            'Failed to fetch session annotations'
        );
    },

    createSessionAnnotation: async (
        sessionId: string,
        payload: {
            labels?: string[];
            severity?: string;
            owner?: string;
            status?: string;
            note?: string;
        }
    ): Promise<SessionAnnotation> => {
        return requestJson<SessionAnnotation>(
            `${API_BASE_URL}/sessions/${sessionId}/annotations`,
            'Failed to create session annotation',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            }
        );
    },

    updateSessionAnnotation: async (
        annotationId: string,
        payload: {
            labels?: string[];
            severity?: string;
            owner?: string;
            status?: string;
            note?: string;
        }
    ): Promise<SessionAnnotation> => {
        return requestJson<SessionAnnotation>(
            `${API_BASE_URL}/sessions/annotations/${annotationId}`,
            'Failed to update session annotation',
            {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            }
        );
    },

    getSessionEvals: async (
        sessionId: string,
        filters?: { run_id?: string; limit?: number; offset?: number }
    ): Promise<SessionEval[]> => {
        const params = new URLSearchParams();
        if (filters?.run_id) params.append('run_id', filters.run_id);
        if (filters?.limit) params.append('limit', filters.limit.toString());
        if (filters?.offset) params.append('offset', filters.offset.toString());
        return requestJson<SessionEval[]>(
            `${API_BASE_URL}/sessions/${sessionId}/evals?${params.toString()}`,
            'Failed to fetch session evals'
        );
    },

    createSessionEval: async (
        sessionId: string,
        payload: {
            run_id?: string;
            scorers?: Array<Record<string, unknown>>;
            expected?: unknown;
            input?: unknown;
            rubric?: Record<string, unknown>;
        }
    ): Promise<SessionEval> => {
        return requestJson<SessionEval>(`${API_BASE_URL}/sessions/${sessionId}/evals`, 'Failed to create session eval', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    },

    getViews: async (projectId: string): Promise<View[]> => {
        return requestJson<View[]>(`${API_BASE_URL}/views/${projectId}`, 'Failed to fetch views');
    },

    createView: async (view: {
        project_id: string;
        name: string;
        entity_type?: string;
        config: ViewConfig;
    }): Promise<View> => {
        return requestJson<View>(`${API_BASE_URL}/views`, 'Failed to create view', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(view),
        });
    },

    deleteView: async (viewId: string): Promise<void> => {
        await requestVoid(`${API_BASE_URL}/views/${viewId}`, 'Failed to delete view', { method: 'DELETE' });
    },
};
