import { API_BASE_URL } from '../../src/lib/api';
import {
  seedLogs,
  seedProject,
  seedQueries,
  seedTraces,
  seedViews,
  childCounts,
  seedDatasets,
  seedDatasetRows,
  seedDatasetHistory,
  seedDatasetRowHistory,
  seedExperiments,
  seedExperimentVersions,
  seedExperimentRuns,
  seedExperimentRunResults,
  seedReviews,
  seedCharts,
  seedModels,
  seedScorers,
  seedAssignments,
  seedMentions,
  seedShareLinks,
} from './seedStoryData';
import type { AqlFilter } from '../../src/types';
import type { Page, Route } from '@playwright/test';

const useLiveApi = process.env.E2E_USE_LIVE_API === 'true' || process.env.E2E_USE_LIVE_API === '1';

const respondJson = (route: Route, payload: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const makeId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

const matchesFilter = (value: unknown, filter: AqlFilter): boolean => {
  const left = String(value ?? '').toLowerCase();
  const right = String(filter.value ?? '').toLowerCase();
  if (filter.op === '=' || filter.op === '==') {
    return left === right;
  }
  if (filter.op === '!=') {
    return left !== right;
  }
  if (filter.op === 'contains') {
    return left.includes(right);
  }
  if (filter.op === 'not contains') {
    return !left.includes(right);
  }
  if (filter.op === 'in' && Array.isArray(filter.value)) {
    return filter.value.map(String).includes(String(value));
  }
  return true;
};

const filterLogs = (filters: AqlFilter[] = []) => {
  return seedLogs.filter((log) =>
    filters.every((filter) => {
      const logValue = (log as unknown as Record<string, unknown>)[filter.field];
      return matchesFilter(logValue, filter);
    }),
  );
};

export const mockSeedStoryApi = async (page: Page) => {
  if (useLiveApi) return;

  const datasets = clone(seedDatasets);
  const datasetRows = new Map<string, any[]>();
  const datasetHistory = new Map<string, any[]>();
  const datasetRowHistory = clone(seedDatasetRowHistory);
  datasets.forEach((dataset) => {
    const rows = seedDatasetRows.filter((row) => row.dataset_id === dataset.id);
    datasetRows.set(dataset.id, clone(rows));
    datasetHistory.set(
      dataset.id,
      clone(seedDatasetHistory.filter((entry) => entry.dataset_id === dataset.id)),
    );
  });

  const experiments = clone(seedExperiments);
  const experimentVersions = clone(seedExperimentVersions);
  const experimentRuns = clone(seedExperimentRuns);
  const experimentResults = new Map<string, any[]>();
  seedExperimentRunResults.forEach((result) => {
    const existing = experimentResults.get(result.run_id) || [];
    existing.push(clone(result));
    experimentResults.set(result.run_id, existing);
  });

  const reviews = clone(seedReviews);
  const charts = clone(seedCharts);
  const models = clone(seedModels);
  const scorers = clone(seedScorers);
  const assignments = clone(seedAssignments);
  const mentions = clone(seedMentions);
  const shareLinks = clone(seedShareLinks);

  const recalcDatasetCounts = (datasetId: string) => {
    const dataset = datasets.find((d) => d.id === datasetId);
    if (!dataset) return;
    const rows = datasetRows.get(datasetId) || [];
    const evalRows = rows.filter((row) => (row.row_kind || 'eval') === 'eval');
    const resourceRows = rows.filter((row) => (row.row_kind || 'eval') === 'resource');
    dataset.row_counts = {
      total: rows.length,
      eval: evalRows.length,
      resource: resourceRows.length,
    };
  };

  const getDatasetRows = (datasetId: string) => datasetRows.get(datasetId) || [];

  const getExperimentVersion = (versionId: string) =>
    experimentVersions.find((v) => v.id === versionId) || null;

  const getRunById = (runId: string) => experimentRuns.find((r) => r.id === runId) || null;

  const getRunResults = (runId: string) => experimentResults.get(runId) || [];

  const ensureExperimentRunResults = (runId: string, datasetId: string) => {
    if (experimentResults.has(runId)) return;
    const rows = getDatasetRows(datasetId);
    const created = rows.map((row, idx) => ({
      id: makeId('res'),
      run_id: runId,
      dataset_row_id: row.id,
      output: { content: `Auto output ${idx + 1} for ${row.id}` },
      scores: { exact_match: 0.7 + idx * 0.1, contains: 0.8 + idx * 0.05 },
      latency_ms: 400 + idx * 30,
      created_at: Date.now(),
    }));
    experimentResults.set(runId, created);
  };

  await page.route(`${API_BASE_URL}/projects`, (route) => respondJson(route, [seedProject]));
  await page.route(`${API_BASE_URL}/projects/${seedProject.id}`, (route) => respondJson(route, seedProject));
  await page.route(new RegExp(`${API_BASE_URL}/projects/${seedProject.id}/traces.*`), (route) => respondJson(route, seedTraces));
  await page.route(`${API_BASE_URL}/views/${seedProject.id}`, (route) => respondJson(route, seedViews));

  await page.route(new RegExp(`${API_BASE_URL}/traces/[^/]+$`), (route) => {
    const url = new URL(route.request().url());
    const traceId = url.pathname.split('/').pop();
    const trace = seedTraces.find((t) => t.id === traceId);
    if (!trace) return respondJson(route, { detail: 'Trace not found' }, 404);
    return respondJson(route, trace);
  });

  await page.route(new RegExp(`${API_BASE_URL}/logs/[^/]+$`), (route) => {
    const url = new URL(route.request().url());
    const logId = url.pathname.split('/').pop();
    const log = seedLogs.find((l) => l.id === logId);
    if (!log) return respondJson(route, { detail: 'Log not found' }, 404);
    return respondJson(route, log);
  });

  await page.route(new RegExp(`${API_BASE_URL}/datasets.*`), async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] !== 'datasets') return route.fallback();

    if (parts.length === 1) {
      if (request.method() === 'GET') {
        const projectId = url.searchParams.get('project_id');
        const data = projectId ? datasets.filter((d) => d.project_id === projectId) : datasets;
        return respondJson(route, data);
      }
      if (request.method() === 'POST') {
        const payload = await request.postDataJSON();
        const created = {
          id: makeId('ds'),
          project_id: payload.project_id || seedProject.id,
          name: payload.name,
          description: payload.description || '',
          version: 1,
          kind: payload.kind || 'eval',
          row_counts: { total: 0, eval: 0, resource: 0 },
          created_at: Date.now(),
        };
        datasets.push(created);
        datasetRows.set(created.id, []);
        datasetHistory.set(created.id, []);
        return respondJson(route, created);
      }
    }

    if (parts.length === 2 && parts[1] === 'promote' && request.method() === 'POST') {
      let payload: any = {};
      try {
        payload = request.postDataJSON() || {};
      } catch {
        payload = {};
      }
      const traceId = url.searchParams.get('trace_id');
      const datasetId = url.searchParams.get('dataset_id');
      if (!traceId || !datasetId) {
        return respondJson(route, { detail: 'Missing trace_id or dataset_id' }, 400);
      }
      const trace = seedTraces.find((t) => t.id === traceId);
      const rowList = getDatasetRows(datasetId);
      const row = {
        id: makeId('row'),
        dataset_id: datasetId,
        row_kind: 'eval',
        eval_label: payload.eval_label || payload.example_type || 'gold',
        logical_id: makeId('logical'),
        version: 1,
        dataset_version: 1,
        is_deleted: false,
        input: trace?.root_span?.input || { prompt: 'Promoted trace input' },
        expected: payload.corrected_expected || trace?.root_span?.output || { answer: 'Promoted output' },
        meta: { source: 'trace', trace_id: traceId },
        example_type: payload.example_type || 'gold',
        source_trace_id: traceId,
        created_at: Date.now(),
      };
      rowList.push(row);
      datasetRows.set(datasetId, rowList);
      recalcDatasetCounts(datasetId);
      return respondJson(route, row);
    }

    if (parts.length === 2) {
      const datasetId = parts[1];
      if (request.method() === 'GET') {
        const dataset = datasets.find((d) => d.id === datasetId);
        if (!dataset) return respondJson(route, { detail: 'Dataset not found' }, 404);
        return respondJson(route, dataset);
      }
    }

    if (parts.length === 3 && parts[2] === 'rows') {
      const datasetId = parts[1];
      if (request.method() === 'GET') {
        const rowList = getDatasetRows(datasetId);
        const rowKind = url.searchParams.get('row_kind');
        const evalLabel = url.searchParams.get('eval_label');
        const filtered = rowList.filter((row) => {
          if (rowKind && row.row_kind !== rowKind) return false;
          if (evalLabel && (row.eval_label || row.example_type) !== evalLabel) return false;
          return true;
        });
        return respondJson(route, filtered);
      }
      if (request.method() === 'POST') {
        const payload = await request.postDataJSON();
        const row = {
          id: makeId('row'),
          dataset_id: datasetId,
          row_kind: payload.row_kind || 'eval',
          eval_label: payload.eval_label || payload.example_type || 'gold',
          logical_id: makeId('logical'),
          version: 1,
          dataset_version: 1,
          is_deleted: false,
          input: payload.input,
          expected: payload.expected || null,
          meta: payload.meta || {},
          example_type: payload.example_type,
          created_at: Date.now(),
        };
        const rowList = getDatasetRows(datasetId);
        rowList.push(row);
        datasetRows.set(datasetId, rowList);
        recalcDatasetCounts(datasetId);
        return respondJson(route, row);
      }
    }

    if (parts.length === 3 && parts[2] === 'history' && request.method() === 'GET') {
      const datasetId = parts[1];
      return respondJson(route, datasetHistory.get(datasetId) || []);
    }

    if (parts.length === 5 && parts[2] === 'rows' && parts[4] === 'history' && request.method() === 'GET') {
      const logicalId = parts[3];
      return respondJson(route, datasetRowHistory[logicalId] || []);
    }

    return respondJson(route, { detail: 'Not found' }, 404);
  });

  await page.route(new RegExp(`${API_BASE_URL}/reviews.*`), async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] !== 'reviews') return route.fallback();

    if (parts.length === 1 && request.method() === 'GET') {
      const projectId = url.searchParams.get('project_id');
      const status = url.searchParams.get('status');
      let data = reviews;
      if (projectId) data = data.filter((r) => r.project_id === projectId);
      if (status) data = data.filter((r) => r.status === status);
      return respondJson(route, data);
    }

    if (parts.length === 2 && parts[1] === 'from-trace' && request.method() === 'POST') {
      const payload = await request.postDataJSON();
      const created = {
        id: makeId('review'),
        project_id: payload.project_id || seedProject.id,
        source_type: 'trace',
        source_id: payload.trace_id,
        status: 'open',
        priority: payload.priority ?? 1,
        labels: payload.labels || [],
        score: null,
        notes: payload.notes || null,
        meta: { input_preview: 'Trace input', output_preview: 'Trace output' },
        created_at: Date.now(),
        updated_at: Date.now(),
      };
      reviews.unshift(created);
      return respondJson(route, created);
    }

    if (parts.length === 2 && request.method() === 'PATCH') {
      const reviewId = parts[1];
      const payload = await request.postDataJSON();
      const review = reviews.find((r) => r.id === reviewId);
      if (!review) return respondJson(route, { detail: 'Review not found' }, 404);
      Object.assign(review, payload, { updated_at: Date.now() });
      return respondJson(route, review);
    }

    if (parts.length === 3 && parts[2] === 'promote' && request.method() === 'POST') {
      const reviewId = parts[1];
      const payload = await request.postDataJSON();
      const review = reviews.find((r) => r.id === reviewId);
      if (!review) return respondJson(route, { detail: 'Review not found' }, 404);
      const datasetId = payload.dataset_id;
      const rowList = getDatasetRows(datasetId);
      const row = {
        id: makeId('row'),
        dataset_id: datasetId,
        row_kind: 'eval',
        eval_label: payload.example_type || 'gold',
        logical_id: makeId('logical'),
        version: 1,
        dataset_version: 1,
        is_deleted: false,
        input: { prompt: review.meta?.input_preview || 'Review input' },
        expected: payload.corrected_expected || { answer: review.meta?.output_preview || 'Review output' },
        meta: { source: 'review', review_id: reviewId },
        example_type: payload.example_type || 'gold',
        created_at: Date.now(),
      };
      rowList.push(row);
      datasetRows.set(datasetId, rowList);
      recalcDatasetCounts(datasetId);
      review.dataset_id = datasetId;
      review.dataset_row_id = row.id;
      review.updated_at = Date.now();
      return respondJson(route, review);
    }

    return respondJson(route, { detail: 'Not found' }, 404);
  });

  await page.route(new RegExp(`${API_BASE_URL}/experiments.*`), async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] !== 'experiments') return route.fallback();

    if (parts.length === 1) {
      if (request.method() === 'GET') {
        const projectId = url.searchParams.get('project_id');
        const data = projectId ? experiments.filter((e) => e.project_id === projectId) : experiments;
        return respondJson(route, data);
      }
      if (request.method() === 'POST') {
        const payload = await request.postDataJSON();
        const created = {
          id: makeId('exp'),
          project_id: payload.project_id || seedProject.id,
          dataset_id: payload.dataset_id,
          name: payload.name,
          status: 'completed' as const,
          summary: { avg_score: 0.0 },
          created_at: Date.now(),
        };
        experiments.push(created);
        return respondJson(route, created);
      }
    }

    if (parts.length >= 2 && parts[1] === 'versions') {
      if (parts.length === 3 && request.method() === 'GET') {
        const version = getExperimentVersion(parts[2]);
        if (!version) return respondJson(route, { detail: 'Version not found' }, 404);
        return respondJson(route, version);
      }
      return respondJson(route, { detail: 'Not found' }, 404);
    }

    if (parts.length >= 2 && parts[1] === 'runs') {
      const runId = parts[2];
      if (parts.length === 3 && request.method() === 'GET') {
        const run = getRunById(runId);
        if (!run) return respondJson(route, { detail: 'Run not found' }, 404);
        return respondJson(route, run);
      }
      if (parts.length === 4 && parts[3] === 'results' && request.method() === 'GET') {
        return respondJson(route, getRunResults(runId));
      }
      return respondJson(route, { detail: 'Not found' }, 404);
    }

    if (parts.length >= 3 && parts[2] === 'compare' && request.method() === 'GET') {
      const experimentId = parts[1];
      const baselineRunId = url.searchParams.get('baseline_run_id');
      const candidateRunId = url.searchParams.get('candidate_run_id');
      const baseRun = baselineRunId ? getRunById(baselineRunId) : null;
      const candRun = candidateRunId ? getRunById(candidateRunId) : null;
      const baseResults = baselineRunId ? getRunResults(baselineRunId) : [];
      const candResults = candidateRunId ? getRunResults(candidateRunId) : [];
      const scoreFor = (result: any) => Number(result?.scores?.exact_match ?? 0);
      const avg = (list: any[]) =>
        list.length ? list.reduce((sum, res) => sum + scoreFor(res), 0) / list.length : 0;
      const deltaSummary = {
        avg_score: avg(candResults) - avg(baseResults),
        baseline: baseRun?.summary?.avg_score ?? null,
        candidate: candRun?.summary?.avg_score ?? null,
      };
      const rows = baseResults.map((base) => {
        const candidate = candResults.find((res) => res.dataset_row_id === base.dataset_row_id);
        const rowInput = seedDatasetRows.find((row) => row.id === base.dataset_row_id)?.input;
        return {
          dataset_row_id: base.dataset_row_id,
          input: rowInput,
          baseline: base,
          candidate,
        };
      });
      return respondJson(route, { experiment_id: experimentId, delta_summary: deltaSummary, rows });
    }

    if (parts.length === 2) {
      const experimentId = parts[1];
      if (request.method() === 'GET') {
        const experiment = experiments.find((e) => e.id === experimentId);
        if (!experiment) return respondJson(route, { detail: 'Experiment not found' }, 404);
        return respondJson(route, experiment);
      }
    }

    if (parts.length === 3 && parts[2] === 'versions') {
      const experimentId = parts[1];
      if (request.method() === 'GET') {
        return respondJson(route, experimentVersions.filter((v) => v.experiment_id === experimentId));
      }
      if (request.method() === 'POST') {
        const payload = await request.postDataJSON();
        const nextVersion = experimentVersions
          .filter((v) => v.experiment_id === experimentId)
          .reduce((max, v) => Math.max(max, v.version_number), 0) + 1;
        const created = {
          id: makeId('exp_ver'),
          experiment_id: experimentId,
          version_number: nextVersion,
          parent_version_id: payload.parent_version_id || null,
          dataset_version_pinned: payload.dataset_version_pinned || 1,
          config: {
            model: { registry_id: payload.model_registry_id },
            task: { system_prompt: payload.system_prompt || '' },
            params: {
              temperature: payload.temperature,
              max_tokens: payload.max_tokens,
            },
            scorers: payload.scorers || ['exact_match'],
          },
          created_at: Date.now(),
        };
        experimentVersions.push(created);
        return respondJson(route, created);
      }
    }

    if (parts.length === 3 && parts[2] === 'main' && request.method() === 'POST') {
      const experimentId = parts[1];
      const versionId = url.searchParams.get('version_id');
      const experiment = experiments.find((e) => e.id === experimentId);
      if (!experiment || !versionId) return respondJson(route, { detail: 'Experiment not found' }, 404);
      experiment.summary = { ...(experiment.summary || {}), main_version_id: versionId };
      return respondJson(route, experiment);
    }

    if (parts.length === 5 && parts[2] === 'versions' && parts[4] === 'runs') {
      const experimentId = parts[1];
      const versionId = parts[3];
      if (request.method() === 'GET') {
        return respondJson(route, experimentRuns.filter((r) => r.experiment_version_id === versionId));
      }
      if (request.method() === 'POST') {
        const runId = makeId('run');
        const created = {
          id: runId,
          experiment_version_id: versionId,
          status: 'completed',
          summary: { avg_score: 0.9, rows_total: 2, rows_done: 2 },
          created_at: Date.now(),
          started_at: Date.now(),
          completed_at: Date.now() + 10 * 1000,
        };
        experimentRuns.push(created);
        const experiment = experiments.find((e) => e.id === experimentId);
        const datasetId = experiment?.dataset_id || seedDatasets[0]?.id;
        ensureExperimentRunResults(runId, datasetId);
        return respondJson(route, created);
      }
    }

    return respondJson(route, { detail: 'Not found' }, 404);
  });

  await page.route(new RegExp(`${API_BASE_URL}/models.*`), (route) => respondJson(route, models));

  await page.route(new RegExp(`${API_BASE_URL}/functions/scorers.*`), (route) => respondJson(route, scorers));

  await page.route(new RegExp(`${API_BASE_URL}/assignments.*`), async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] !== 'assignments') return route.fallback();
    if (parts.length === 1 && request.method() === 'GET') {
      const projectId = url.searchParams.get('project_id');
      const data = projectId ? assignments.filter((a) => a.project_id === projectId) : assignments;
      return respondJson(route, data);
    }
    if (parts.length === 1 && request.method() === 'POST') {
      const payload = await request.postDataJSON();
      const created = {
        id: makeId('assign'),
        project_id: payload.project_id || seedProject.id,
        object_type: payload.object_type,
        object_id: payload.object_id,
        assignee: payload.assignee,
        status: payload.status || 'open',
        note: payload.note || null,
        created_at: Date.now(),
        updated_at: Date.now(),
      };
      assignments.push(created);
      return respondJson(route, created);
    }
    if (parts.length === 2 && request.method() === 'PATCH') {
      const assignment = assignments.find((a) => a.id === parts[1]);
      if (!assignment) return respondJson(route, { detail: 'Assignment not found' }, 404);
      const payload = await request.postDataJSON();
      Object.assign(assignment, payload, { updated_at: Date.now() });
      return respondJson(route, assignment);
    }
    if (parts.length === 2 && request.method() === 'DELETE') {
      const idx = assignments.findIndex((a) => a.id === parts[1]);
      if (idx >= 0) assignments.splice(idx, 1);
      return respondJson(route, { ok: true });
    }
    return respondJson(route, { detail: 'Not found' }, 404);
  });

  await page.route(new RegExp(`${API_BASE_URL}/mentions.*`), async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] !== 'mentions') return route.fallback();
    if (parts.length === 1 && request.method() === 'GET') {
      const projectId = url.searchParams.get('project_id');
      const data = projectId ? mentions.filter((m) => m.project_id === projectId) : mentions;
      return respondJson(route, data);
    }
    if (parts.length === 1 && request.method() === 'POST') {
      const payload = await request.postDataJSON();
      const created = {
        id: makeId('mention'),
        project_id: payload.project_id || seedProject.id,
        object_type: payload.object_type,
        object_id: payload.object_id,
        mentioned: payload.mentioned,
        note: payload.note || null,
        created_at: Date.now(),
      };
      mentions.push(created);
      return respondJson(route, created);
    }
    if (parts.length === 2 && request.method() === 'DELETE') {
      const idx = mentions.findIndex((m) => m.id === parts[1]);
      if (idx >= 0) mentions.splice(idx, 1);
      return respondJson(route, { ok: true });
    }
    return respondJson(route, { detail: 'Not found' }, 404);
  });

  await page.route(new RegExp(`${API_BASE_URL}/share-links.*`), async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] !== 'share-links') return route.fallback();

    if (parts.length === 1 && request.method() === 'GET') {
      const projectId = url.searchParams.get('project_id');
      const data = projectId ? shareLinks.filter((s) => s.project_id === projectId) : shareLinks;
      return respondJson(route, data);
    }

    if (parts.length === 1 && request.method() === 'POST') {
      const payload = await request.postDataJSON();
      const token = makeId('share');
      const created = {
        id: makeId('share_link'),
        token,
        project_id: payload.project_id || seedProject.id,
        object_type: payload.object_type,
        object_id: payload.object_id,
        expires_at: payload.expires_at || null,
        created_at: Date.now(),
      };
      shareLinks.push(created);
      return respondJson(route, created);
    }

    if (parts.length === 2 && request.method() === 'GET') {
      const token = parts[1];
      const link = shareLinks.find((s) => s.token === token);
      if (!link) return respondJson(route, { detail: 'Share link not found' }, 404);
      return respondJson(route, link);
    }

    if (parts.length === 2 && request.method() === 'DELETE') {
      const token = parts[1];
      const link = shareLinks.find((s) => s.token === token);
      if (link) link.revoked_at = Date.now();
      return respondJson(route, link || { ok: true });
    }

    return respondJson(route, { detail: 'Not found' }, 404);
  });

  await page.route(new RegExp(`${API_BASE_URL}/charts.*`), async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] !== 'charts') return route.fallback();

    if (parts.length === 2 && request.method() === 'GET') {
      const projectId = parts[1];
      return respondJson(route, charts.filter((c) => c.project_id === projectId));
    }
    if (parts.length === 1 && request.method() === 'POST') {
      const payload = await request.postDataJSON();
      const created = {
        id: makeId('chart'),
        project_id: payload.project_id,
        name: payload.name,
        query: payload.query,
        chart_type: payload.chart_type,
        x_field: payload.x_field,
        y_field: payload.y_field,
        series_field: payload.series_field || null,
        config: payload.config || {},
        created_at: Date.now(),
        updated_at: Date.now(),
      };
      charts.push(created);
      return respondJson(route, created);
    }
    if (parts.length === 2 && request.method() === 'PATCH') {
      const chart = charts.find((c) => c.id === parts[1]);
      if (!chart) return respondJson(route, { detail: 'Chart not found' }, 404);
      const payload = await request.postDataJSON();
      Object.assign(chart, payload, { updated_at: Date.now() });
      return respondJson(route, chart);
    }
    if (parts.length === 2 && request.method() === 'DELETE') {
      const idx = charts.findIndex((c) => c.id === parts[1]);
      if (idx >= 0) charts.splice(idx, 1);
      return respondJson(route, { ok: true });
    }
    return respondJson(route, { detail: 'Not found' }, 404);
  });

  await page.route(`${API_BASE_URL}/aql/query`, async (route) => {
    const body = await route.request().postDataJSON();
    const builder = body?.builder;
    const query = body?.query;

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
        const parentIds = (builder.filters || [])
          .filter((filter: AqlFilter) => filter.field === 'parent_trace_id')
          .flatMap((filter: AqlFilter) => (Array.isArray(filter.value) ? filter.value : [filter.value]));
        const counts = seedTraces.reduce((acc, trace) => {
          if (!trace.parent_trace_id) return acc;
          acc[trace.parent_trace_id] = (acc[trace.parent_trace_id] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        const data = Object.entries(counts)
          .filter(([parentId]) => parentIds.length === 0 || parentIds.includes(parentId))
          .map(([parent_trace_id, child_count]) => ({ parent_trace_id, child_count }));
        return respondJson(route, {
          shape: 'project_traces',
          schema: ['parent_trace_id', 'child_count'],
          data: data.length ? data : childCounts,
        });
      }
    }

    if (query && typeof query === 'string') {
      if (query.includes('project_logs')) {
        return respondJson(route, {
          shape: 'project_logs',
          schema: [],
          data: seedLogs,
          query,
        });
      }
      if (query.includes('project_traces')) {
        return respondJson(route, {
          shape: 'project_traces',
          schema: [],
          data: seedTraces,
          query,
        });
      }
      return respondJson(route, { shape: 'unknown', schema: [], data: [], query });
    }

    return respondJson(route, { shape: builder?.shape || 'unknown', schema: [], data: [] });
  });
};
