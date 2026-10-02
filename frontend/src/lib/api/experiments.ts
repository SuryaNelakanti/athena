import { API_BASE_URL, requestJson } from './base';
import type {
    Experiment,
    ExperimentComparisonResult,
    ExperimentCreateInput,
    ExperimentResult,
    ExperimentRun,
    ExperimentRunResult,
    ExperimentVersion,
    ExperimentVersionCreateInput,
    ModelRegistry,
    ModelRegistryCreateInput,
    ModelRegistrySyncInput,
    ModelRegistryUpdateInput,
    ProviderKeyStatus,
    RunExperimentInput,
} from '../../types';

export const experimentsApi = {
    // Experiments
    getExperiments: async (projectId: string): Promise<Experiment[]> => {
        return requestJson<Experiment[]>(`${API_BASE_URL}/experiments/?project_id=${projectId}`, 'Failed to fetch experiments');
    },

    createExperiment: async (experiment: ExperimentCreateInput): Promise<Experiment> => {
        return requestJson<Experiment>(`${API_BASE_URL}/experiments/`, 'Failed to create experiment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(experiment),
        });
    },

    getExperimentResults: async (experimentId: string): Promise<ExperimentResult[]> => {
        return requestJson<ExperimentResult[]>(`${API_BASE_URL}/experiments/${experimentId}/results`, 'Failed to fetch experiment results');
    },

    compareExperimentRuns: async (
        experimentId: string,
        baselineRunId: string,
        candidateRunId: string
    ): Promise<ExperimentComparisonResult> => {
        const params = new URLSearchParams({
            baseline_run_id: baselineRunId,
            candidate_run_id: candidateRunId,
        });
        return requestJson<ExperimentComparisonResult>(
            `${API_BASE_URL}/experiments/${experimentId}/compare?${params.toString()}`,
            'Failed to compare runs'
        );
    },

    getExperiment: async (experimentId: string): Promise<Experiment> => {
        return requestJson<Experiment>(`${API_BASE_URL}/experiments/${experimentId}`, 'Failed to fetch experiment');
    },

    runExperiment: async (
        experimentId: string,
        payload: RunExperimentInput
    ): Promise<Experiment> => {
        return requestJson<Experiment>(`${API_BASE_URL}/experiments/${experimentId}/run`, 'Failed to run experiment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    },

    // Models registry (curated list used by UI)
    getModelRegistry: async (enabledOnly: boolean = true): Promise<ModelRegistry[]> => {
        return requestJson<ModelRegistry[]>(
            `${API_BASE_URL}/models?enabled_only=${enabledOnly ? 'true' : 'false'}`,
            'Failed to fetch model registry'
        );
    },

    createModelRegistryEntry: async (payload: ModelRegistryCreateInput): Promise<ModelRegistry> => {
        return requestJson<ModelRegistry>(`${API_BASE_URL}/models`, 'Failed to create model', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    },

    syncModelRegistry: async (payload: ModelRegistrySyncInput = {}): Promise<ModelRegistry[]> => {
        return requestJson<ModelRegistry[]>(`${API_BASE_URL}/models/sync`, 'Failed to sync models', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    },

    updateModelRegistryEntry: async (id: string, payload: ModelRegistryUpdateInput): Promise<ModelRegistry> => {
        return requestJson<ModelRegistry>(`${API_BASE_URL}/models/${id}`, 'Failed to update model', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    },

    getProviderStatuses: async (): Promise<ProviderKeyStatus[]> => {
        return requestJson<ProviderKeyStatus[]>(`${API_BASE_URL}/providers`, 'Failed to fetch providers');
    },

    setProviderApiKey: async (provider: ProviderKeyStatus['provider'], api_key: string): Promise<ProviderKeyStatus> => {
        return requestJson<ProviderKeyStatus>(`${API_BASE_URL}/providers/${provider}/apikey`, 'Failed to set api key', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key }),
        });
    },

    clearProviderApiKey: async (provider: ProviderKeyStatus['provider']): Promise<ProviderKeyStatus> => {
        return requestJson<ProviderKeyStatus>(`${API_BASE_URL}/providers/${provider}/apikey`, 'Failed to clear api key', {
            method: 'DELETE',
        });
    },

    // Experiments v2 (versions + runs)
    getExperimentVersions: async (experimentId: string): Promise<ExperimentVersion[]> => {
        return requestJson<ExperimentVersion[]>(`${API_BASE_URL}/experiments/${experimentId}/versions`, 'Failed to fetch experiment versions');
    },

    getExperimentVersion: async (versionId: string): Promise<ExperimentVersion> => {
        return requestJson<ExperimentVersion>(`${API_BASE_URL}/experiments/versions/${versionId}`, 'Failed to fetch experiment version');
    },

    createExperimentVersion: async (
        experimentId: string,
        payload: ExperimentVersionCreateInput
    ): Promise<ExperimentVersion> => {
        return requestJson<ExperimentVersion>(`${API_BASE_URL}/experiments/${experimentId}/versions`, 'Failed to create experiment version', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    },

    setExperimentMainVersion: async (experimentId: string, versionId: string): Promise<Experiment> => {
        return requestJson<Experiment>(
            `${API_BASE_URL}/experiments/${experimentId}/main?version_id=${encodeURIComponent(versionId)}`,
            'Failed to set main version',
            { method: 'POST' }
        );
    },

    getVersionRuns: async (experimentId: string, versionId: string): Promise<ExperimentRun[]> => {
        return requestJson<ExperimentRun[]>(
            `${API_BASE_URL}/experiments/${experimentId}/versions/${versionId}/runs`,
            'Failed to fetch runs'
        );
    },

    createVersionRun: async (experimentId: string, versionId: string): Promise<ExperimentRun> => {
        return requestJson<ExperimentRun>(
            `${API_BASE_URL}/experiments/${experimentId}/versions/${versionId}/runs`,
            'Failed to create run',
            { method: 'POST' }
        );
    },

    getExperimentRun: async (runId: string): Promise<ExperimentRun> => {
        return requestJson<ExperimentRun>(`${API_BASE_URL}/experiments/runs/${runId}`, 'Failed to fetch run');
    },

    cancelRun: async (runId: string): Promise<ExperimentRun> => {
        return requestJson<ExperimentRun>(`${API_BASE_URL}/experiments/runs/${runId}/cancel`, 'Failed to cancel run', {
            method: 'POST',
        });
    },

    getRunResults: async (runId: string): Promise<ExperimentRunResult[]> => {
        return requestJson<ExperimentRunResult[]>(`${API_BASE_URL}/experiments/runs/${runId}/results`, 'Failed to fetch run results');
    },
};
