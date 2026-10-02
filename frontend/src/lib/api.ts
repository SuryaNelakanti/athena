import { coreApi } from './api/core';
import { sessionsApi } from './api/sessions';
import { playgroundsApi } from './api/playgrounds';
import { observabilityApi } from './api/observability';
import { datasetsApi } from './api/datasets';
import { collaborationApi } from './api/collaboration';
import { reviewsApi } from './api/reviews';
import { experimentsApi } from './api/experiments';
import { functionsApi } from './api/functions';
import { operationsApi } from './api/operations';
import { promptTestsApi } from './api/prompt_tests';
import type { Project, Trace } from '../types';

export { API_BASE_URL } from './api/base';
export type { View } from './api/view';

export const api = {
    ...coreApi,
    ...sessionsApi,
    ...playgroundsApi,
    ...observabilityApi,
    ...datasetsApi,
    ...collaborationApi,
    ...reviewsApi,
    ...experimentsApi,
    ...functionsApi,
    ...operationsApi,
    ...promptTestsApi,
};

export async function fetchProjects(): Promise<Project[]> {
    return api.getProjects();
}

export async function fetchTraces(projectId: string): Promise<Trace[]> {
    return api.getTraces(projectId);
}
