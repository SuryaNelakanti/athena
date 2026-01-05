import { API_BASE_URL } from '../../src/services/api';
import { seedLogs, seedProject, seedQueries, seedTraces, seedViews, childCounts } from './seedStoryData';
import type { AqlFilter } from '../../src/types';
import type { Page, Route } from '@playwright/test';

const useLiveApi = process.env.E2E_USE_LIVE_API === 'true' || process.env.E2E_USE_LIVE_API === '1';

const respondJson = (route: Route, payload: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });

const matchesFilter = (value: unknown, filter: AqlFilter): boolean => {
  if (filter.op === '=' || filter.op === '==') {
    return String(value ?? '').toLowerCase() === String(filter.value ?? '').toLowerCase();
  }
  if (filter.op === 'contains') {
    return String(value ?? '').toLowerCase().includes(String(filter.value ?? '').toLowerCase());
  }
  if (filter.op === 'in' && Array.isArray(filter.value)) {
    return filter.value.map(String).includes(String(value));
  }
  return true;
};

const filterLogs = (filters: AqlFilter[] = []) => {
  return seedLogs.filter((log) =>
    filters.every((filter) => {
      const logValue = (log as Record<string, unknown>)[filter.field];
      return matchesFilter(logValue, filter);
    }),
  );
};

export const mockSeedStoryApi = async (page: Page) => {
  if (useLiveApi) return;

  await page.route(`${API_BASE_URL}/projects`, (route) => respondJson(route, [seedProject]));
  await page.route(`${API_BASE_URL}/projects/${seedProject.id}`, (route) => respondJson(route, seedProject));
  await page.route(new RegExp(`${API_BASE_URL}/projects/${seedProject.id}/traces.*`), (route) => respondJson(route, seedTraces));
  await page.route(`${API_BASE_URL}/views/${seedProject.id}`, (route) => respondJson(route, seedViews));

  await page.route(`${API_BASE_URL}/aql/query`, async (route) => {
    const body = await route.request().postDataJSON();
    const builder = body?.builder;

    if (builder?.shape === 'project_logs') {
      const filteredLogs = filterLogs(builder.filters || []);
      return respondJson(route, {
        shape: 'project_logs',
        schema: [],
        data: filteredLogs,
        query: seedQueries.logs,
      });
    }

    if (builder?.shape === 'project_traces') {
      if (builder.select?.includes('id')) {
        const idsFilter = (builder.filters || []).find((f: AqlFilter) => f.field === 'id');
        const ids = Array.isArray(idsFilter?.value) ? idsFilter?.value : builder.filters?.map((f: AqlFilter) => f.value);
        const data = seedTraces
          .filter((trace) => !ids || ids.includes(trace.id))
          .map((trace) => ({ id: trace.id, parent_trace_id: trace.parent_trace_id }));
        return respondJson(route, { shape: 'project_traces', schema: ['id', 'parent_trace_id'], data });
      }

      if (builder.dimensions?.includes('parent_trace_id')) {
        return respondJson(route, {
          shape: 'project_traces',
          schema: ['parent_trace_id', 'child_count'],
          data: childCounts,
        });
      }
    }

    return respondJson(route, { shape: builder?.shape || 'unknown', schema: [], data: [] });
  });
};
