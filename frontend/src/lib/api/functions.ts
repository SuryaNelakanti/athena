import { API_BASE_URL, requestJson } from './base';
import type {
    DeleteResult,
    Function as FunctionAsset,
    FunctionCreateInput,
    FunctionUpdateInput,
    SeedBuiltinScorersResult,
} from '../../types';

export const functionsApi = {
    // Functions/Scorers Registry
    getScorers: async (projectId?: string): Promise<FunctionAsset[]> => {
        const params = projectId ? `?project_id=${projectId}` : '';
        return requestJson<FunctionAsset[]>(`${API_BASE_URL}/functions/scorers${params}`, 'Failed to fetch scorers');
    },

    getFunctions: async (
        projectId?: string,
        type?: FunctionAsset['type'],
        includeBuiltin: boolean = true
    ): Promise<FunctionAsset[]> => {
        const params = new URLSearchParams();
        if (projectId) params.append('project_id', projectId);
        if (type) params.append('type', type);
        params.append('include_builtin', String(includeBuiltin));
            return requestJson<FunctionAsset[]>(
            `${API_BASE_URL}/functions/?${params.toString()}`,
            'Failed to fetch functions'
        );
    },

    getFunction: async (functionId: string): Promise<FunctionAsset> => {
        return requestJson<FunctionAsset>(`${API_BASE_URL}/functions/${functionId}`, 'Failed to fetch function');
    },

    createFunction: async (projectId: string, payload: FunctionCreateInput): Promise<FunctionAsset> => {
        return requestJson<FunctionAsset>(`${API_BASE_URL}/functions/?project_id=${projectId}`, 'Failed to create function', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    },

    updateFunction: async (functionId: string, payload: FunctionUpdateInput): Promise<FunctionAsset> => {
        return requestJson<FunctionAsset>(`${API_BASE_URL}/functions/${functionId}`, 'Failed to update function', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    },

    deleteFunction: async (functionId: string): Promise<DeleteResult> => {
        return requestJson<DeleteResult>(`${API_BASE_URL}/functions/${functionId}`, 'Failed to delete function', {
            method: 'DELETE',
        });
    },

    seedBuiltinScorers: async (): Promise<SeedBuiltinScorersResult> => {
        return requestJson<SeedBuiltinScorersResult>(`${API_BASE_URL}/functions/seed-builtins`, 'Failed to seed builtin scorers', {
            method: 'POST',
        });
    },
};
