import type { Dataset, DatasetRow, DatasetVersion } from '../../types';
import { API_BASE_URL, requestJson } from './base';

type DatasetCreatePayload = {
    project_id: string;
    name: string;
    description?: string;
    kind?: Dataset['kind'];
    schema?: Record<string, unknown>;
    schema_version?: number;
    review_policy?: Record<string, unknown>;
};

type DatasetRowPayload = {
    input?: unknown;
    expected?: unknown;
    example_type?: string;
    row_kind?: string;
    eval_label?: string;
    meta?: Record<string, unknown>;
};

type DatasetRowCreatePayload = DatasetRowPayload & { input: unknown };

export const datasetsApi = {
    getDatasets: async (projectId: string): Promise<Dataset[]> =>
        requestJson<Dataset[]>(
            `${API_BASE_URL}/datasets/?project_id=${projectId}`,
            'Failed to fetch datasets'
        ),

    getDataset: async (datasetId: string): Promise<Dataset> =>
        requestJson<Dataset>(`${API_BASE_URL}/datasets/${datasetId}`, 'Failed to fetch dataset'),

    createDataset: async (dataset: DatasetCreatePayload): Promise<Dataset> =>
        requestJson<Dataset>(`${API_BASE_URL}/datasets/`, 'Failed to create dataset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dataset),
        }),

    getDatasetRows: async (
        datasetId: string,
        filters?: { row_kind?: string; eval_label?: string; at_version?: number }
    ): Promise<DatasetRow[]> => {
        const params = new URLSearchParams();
        if (filters?.row_kind) params.append('row_kind', filters.row_kind);
        if (filters?.eval_label) params.append('eval_label', filters.eval_label);
        if (filters?.at_version !== undefined) params.append('at_version', String(filters.at_version));
        const query = params.toString();
        return requestJson<DatasetRow[]>(
            `${API_BASE_URL}/datasets/${datasetId}/rows${query ? `?${query}` : ''}`,
            'Failed to fetch dataset rows'
        );
    },

    getDatasetHistory: async (datasetId: string): Promise<DatasetVersion[]> =>
        requestJson<DatasetVersion[]>(
            `${API_BASE_URL}/datasets/${datasetId}/history`,
            'Failed to fetch dataset history'
        ),

    getDatasetRowHistory: async (datasetId: string, logicalId: string): Promise<DatasetRow[]> =>
        requestJson<DatasetRow[]>(
            `${API_BASE_URL}/datasets/${datasetId}/rows/${logicalId}/history`,
            'Failed to fetch dataset row history'
        ),

    addDatasetRow: async (datasetId: string, row: DatasetRowCreatePayload): Promise<DatasetRow> =>
        requestJson<DatasetRow>(`${API_BASE_URL}/datasets/${datasetId}/rows`, 'Failed to add dataset row', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(row),
        }),

    updateDatasetRow: async (
        datasetId: string,
        rowId: string,
        updates: DatasetRowPayload & { is_deleted?: boolean; reason?: string }
    ): Promise<DatasetRow> =>
        requestJson<DatasetRow>(
            `${API_BASE_URL}/datasets/${datasetId}/rows/${rowId}`,
            'Failed to update dataset row',
            {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates),
            }
        ),

    deleteDatasetRow: async (datasetId: string, rowId: string, reason?: string): Promise<DatasetRow> => {
        const params = reason ? `?reason=${encodeURIComponent(reason)}` : '';
        return requestJson<DatasetRow>(
            `${API_BASE_URL}/datasets/${datasetId}/rows/${rowId}${params}`,
            'Failed to delete dataset row',
            { method: 'DELETE' }
        );
    },

    flushDataset: async (datasetId: string, reason?: string): Promise<DatasetVersion> => {
        const params = reason ? `?reason=${encodeURIComponent(reason)}` : '';
        return requestJson<DatasetVersion>(
            `${API_BASE_URL}/datasets/${datasetId}/flush${params}`,
            'Failed to flush dataset',
            { method: 'POST' }
        );
    },

    promoteToDataset: async (
        traceId: string,
        datasetId: string,
        options?: {
            corrected_expected?: unknown;
            example_type?: string;
            row_kind?: string;
            eval_label?: string;
        }
    ): Promise<DatasetRow> => {
        const params = new URLSearchParams({ trace_id: traceId, dataset_id: datasetId });
        return requestJson<DatasetRow>(
            `${API_BASE_URL}/datasets/promote?${params.toString()}`,
            'Failed to promote trace to dataset',
            {
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
            }
        );
    },

    promoteRunToDataset: async (payload: {
        run_id: string;
        dataset_id: string;
        label?: 'gold' | 'anti_pattern' | string;
        note?: string;
    }): Promise<DatasetRow> =>
        requestJson<DatasetRow>(
            `${API_BASE_URL}/datasets/promote-from-run`,
            'Failed to promote run to dataset',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            }
        ),
};
