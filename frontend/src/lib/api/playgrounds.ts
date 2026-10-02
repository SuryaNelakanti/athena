import { API_BASE_URL, requestJson, requestVoid } from './base';
import type { Playground } from '../../types';

export const playgroundsApi = {
    // Playgrounds
    getPlaygrounds: async (
        projectId: string,
        filters?: { search?: string; limit?: number }
    ): Promise<Playground[]> => {
        const params = new URLSearchParams({ project_id: projectId });
        if (filters?.search) params.append('search', filters.search);
        if (filters?.limit) params.append('limit', filters.limit.toString());
        return requestJson<Playground[]>(
            `${API_BASE_URL}/playgrounds?${params.toString()}`,
            'Failed to fetch playgrounds'
        );
    },

    getPlayground: async (playgroundId: string): Promise<Playground> => {
        return requestJson<Playground>(
            `${API_BASE_URL}/playgrounds/${playgroundId}`,
            'Failed to fetch playground'
        );
    },

    createPlayground: async (payload: {
        project_id: string;
        name: string;
        description?: string;
        config?: Record<string, unknown>;
    }): Promise<Playground> => {
        return requestJson<Playground>(`${API_BASE_URL}/playgrounds`, 'Failed to create playground', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    },

    updatePlayground: async (
        playgroundId: string,
        payload: { name?: string; description?: string; config?: Record<string, unknown> }
    ): Promise<Playground> => {
        return requestJson<Playground>(
            `${API_BASE_URL}/playgrounds/${playgroundId}`,
            'Failed to update playground',
            {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            }
        );
    },

    deletePlayground: async (playgroundId: string): Promise<void> => {
        await requestVoid(`${API_BASE_URL}/playgrounds/${playgroundId}`, 'Failed to delete playground', {
            method: 'DELETE',
        });
    },
};
