import { API_BASE_URL, requestJson } from './base';
import type { PromptTest, PromptTestResult } from '../../types';

export const promptTestsApi = {
    // Prompt Tests
    createPromptTest: async (payload: Partial<PromptTest>): Promise<PromptTest> => {
        return requestJson<PromptTest>(`${API_BASE_URL}/prompt-tests/`, 'Failed to create prompt test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    },

    runPromptTest: async (promptTestId: string): Promise<PromptTest> => {
        return requestJson<PromptTest>(`${API_BASE_URL}/prompt-tests/${promptTestId}/run`, 'Failed to run prompt test', {
            method: 'POST',
        });
    },

    getPromptTest: async (promptTestId: string): Promise<PromptTest> => {
        return requestJson<PromptTest>(`${API_BASE_URL}/prompt-tests/${promptTestId}`, 'Failed to fetch prompt test');
    },

    listPromptTests: async (projectId: string, datasetId?: string): Promise<PromptTest[]> => {
        const params = new URLSearchParams({ project_id: projectId });
        if (datasetId) params.append('dataset_id', datasetId);
        return requestJson<PromptTest[]>(
            `${API_BASE_URL}/prompt-tests/?${params.toString()}`,
            'Failed to list prompt tests'
        );
    },

    getPromptTestResults: async (promptTestId: string): Promise<PromptTestResult[]> => {
        return requestJson<PromptTestResult[]>(
            `${API_BASE_URL}/prompt-tests/${promptTestId}/results`,
            'Failed to fetch prompt test results'
        );
    },
};
