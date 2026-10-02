import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useProject } from '../contexts/ProjectContext';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type {
  ExperimentVersion,
  Function,
  ScorerConfig,
} from '../types';
import {
    PlusIcon,
    PlayIcon,
    LinkIcon,
} from '@heroicons/react/24/outline';
import { Badge, Button, Card, Tabs } from '../components/ui';
import { PageHeader } from '../layouts/PageHeader';
import { ExperimentOverviewSidebar } from '../features/experiments/ExperimentOverviewSidebar';
import { ExperimentComparisonWorkspace } from '../features/experiments/ExperimentComparisonWorkspace';
import {
  ExperimentResultsPanel,
  type ExperimentResultFilter,
} from '../features/experiments/ExperimentResultsPanel';
import { ExperimentVersionForm } from '../features/experiments/ExperimentVersionForm';
import { ExperimentShareModal } from '../features/experiments/ExperimentShareModal';
import { useExperimentDetailData } from '../features/experiments/useExperimentDetailData';
import { useExperimentRunActions } from '../features/experiments/useExperimentRunActions';
import { useExperimentShare } from '../features/experiments/useExperimentShare';
import { useExperimentVersionDraft } from '../features/experiments/useExperimentVersionDraft';

const RESULT_TABS = [
  { id: 'results', label: 'Results' },
  { id: 'compare', label: 'Compare' },
  { id: 'trends', label: 'Trends' },
];
const EMPTY_VERSION_CONFIG: Record<string, unknown> = {};

const ExperimentDetail: React.FC = () => {
  const { currentProject } = useProject();
  const projectId = currentProject?.id || '';
  const { experimentId } = useParams({ from: '/experiments/$experimentId' });
  const navigate = useNavigate({ from: '/experiments/$experimentId' });
  const search = useSearch({ from: '/experiments/$experimentId' });

  const [showCreateVersion, setShowCreateVersion] = useState(false);
  const [expandedResultId, setExpandedResultId] = useState<string | null>(null);
  const [resultsFilter, setResultsFilter] = useState<ExperimentResultFilter>('all');
  const [resultsSearch, setResultsSearch] = useState('');

  const versionParam = search.version;
  const runParam = search.run;
  const resultParam = search.result;
  const tabParam = search.tab || 'results';

  const setParam = useCallback((key: 'version' | 'run' | 'result' | 'tab' | 'compare', value: string | null, replace: boolean = false) => {
    navigate({
      search: (previous) => ({ ...previous, [key]: value || undefined }),
      replace,
    });
  }, [navigate]);

  const {
    dataset,
    datasetRows,
    error,
    experiment,
    loading,
    mainVersionId,
    models,
    results,
    runs,
    scorers,
    selectedRun,
    selectedVersion,
    setError,
    setRuns,
    setVersions,
    versions,
  } = useExperimentDetailData({
    experimentId,
    projectId,
    versionId: versionParam,
    runId: runParam,
    setSearchParam: setParam,
  });
  const share = useExperimentShare({ experiment, selectedRun });
  const setRunId = useCallback((nextRunId: string) => {
    setParam('run', nextRunId);
  }, [setParam]);
  const { runSelectedVersion, cancelRun } = useExperimentRunActions({
    experimentId,
    selectedVersion,
    setRuns,
    setRunId,
    onErrorChange: setError,
  });

  useEffect(() => {
    if (!resultParam) return;
    setExpandedResultId(resultParam);
  }, [resultParam]);

  const versionConfig = selectedVersion?.config ?? EMPTY_VERSION_CONFIG;

  const configuredScorerConfigs = useMemo(() => {
    const raw = Array.isArray(versionConfig.scorers) ? versionConfig.scorers : [];
    return raw.flatMap((entry): ScorerConfig[] => {
        if (!entry) return [];
        if (typeof entry === 'string') {
          return entry.trim()
            ? [{ type: entry, weight: 1.0, threshold: 0.8, is_primary: false }]
            : [];
        }
        return typeof entry.type === 'string' && entry.type.trim() ? [entry] : [];
      });
  }, [versionConfig]);

  const scorerIndex = useMemo(() => {
    const map = new Map<string, Function>();
    scorers.forEach((s) => map.set(s.name, s));
    return map;
  }, [scorers]);

  const handleVersionCreated = useCallback((created: ExperimentVersion) => {
    setVersions((current) => [created, ...current]);
    setShowCreateVersion(false);
    setParam('version', created.id);
  }, [setParam, setVersions]);

  const {
    draft: newVersion,
    updateDraft: updateNewVersion,
    toggleScorer: toggleNewScorer,
    setPrimaryScorer,
    updateScorerConfig,
    createVersion: handleCreateVersion,
  } = useExperimentVersionDraft({
    experimentId,
    models,
    selectedVersion,
    versions,
    defaultScorers: configuredScorerConfigs,
    onVersionCreated: handleVersionCreated,
    onErrorChange: setError,
  });

  const runsTrendData = useMemo(() => {
    return runs.map((run) => ({
      id: run.id,
      created_at: run.created_at,
      avg_score: typeof run.summary?.avg_score === 'number' ? run.summary.avg_score : null,
      weighted_avg_score: typeof run.summary?.weighted_avg_score === 'number' ? run.summary.weighted_avg_score : null,
    }));
  }, [runs]);

  const toggleResult = (resultId: string) => {
    setExpandedResultId((prev) => {
      const next = prev === resultId ? null : resultId;
      setParam('result', next);
      return next;
    });
  };

  if (!experimentId) {
    return <div className="flex items-center justify-center h-full text-text-muted">Experiment not found.</div>;
  }

  if (loading) {
    return <div className="flex items-center justify-center h-full text-text-muted">Loading experiment...</div>;
  }

  if (!experiment) {
    return <div className="flex items-center justify-center h-full text-text-muted">Experiment not found.</div>;
  }

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title={experiment.name}
        subtitle={dataset ? `${dataset.name} - v${selectedVersion?.dataset_version_pinned ?? dataset.version}` : 'Dataset pinned'}
        onBack={() => navigate({ to: '/experiments' })}
        badge={dataset ? (
          <div className="flex items-center gap-2 text-xs text-text-muted font-medium">
            <Badge variant="primary">Dataset v{selectedVersion?.dataset_version_pinned ?? dataset.version}</Badge>
            {dataset.version > (selectedVersion?.dataset_version_pinned ?? dataset.version) && (
              <Badge variant="warning">Latest v{dataset.version}</Badge>
            )}
          </div>
        ) : undefined}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => share.openShare()}>
              <LinkIcon className="w-4 h-4" /> Share
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setShowCreateVersion(true)}>
              <PlusIcon className="w-4 h-4" /> New Version
            </Button>
            <Button variant="primary" size="sm" onClick={runSelectedVersion} disabled={!selectedVersion}>
              <PlayIcon className="w-4 h-4" /> Run Version
            </Button>
          </div>
        }
      />

      {error && (
        <div className="px-6 py-3 text-sm text-rose-500 font-medium">{error}</div>
      )}

      <div className="flex-1 overflow-hidden px-6 pb-6">
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 h-full">
          <ExperimentOverviewSidebar
            versions={versions}
            selectedVersion={selectedVersion}
            mainVersionId={mainVersionId}
            configuredScorers={configuredScorerConfigs}
            scorerIndex={scorerIndex}
            runs={runs}
            selectedRun={selectedRun}
            onSelectVersion={(versionId) => setParam('version', versionId)}
            onSelectRun={(runId) => setParam('run', runId)}
            onCancelRun={cancelRun}
          />

          <div className="flex flex-col gap-4 overflow-y-auto">
            <Tabs
              options={RESULT_TABS}
              value={tabParam}
              onChange={(tab) => setParam('tab', tab)}
            />

            {tabParam === 'results' && (
              <ExperimentResultsPanel
                results={results}
                datasetRows={datasetRows}
                selectedRun={selectedRun}
                configuredScorers={configuredScorerConfigs}
                scorerIndex={scorerIndex}
                filter={resultsFilter}
                search={resultsSearch}
                expandedResultId={expandedResultId}
                onFilterChange={setResultsFilter}
                onSearchChange={setResultsSearch}
                onToggleResult={toggleResult}
                onOpenTrace={(traceId) => navigate({ to: '/logs', search: { trace_id: traceId } })}
                onOpenShare={share.openShare}
              />
            )}
            <ExperimentComparisonWorkspace
              visible={tabParam === 'compare'}
              experimentId={experimentId}
              initialVersionId={selectedVersion?.id ?? null}
              versions={versions}
              scorers={configuredScorerConfigs}
              scorerIndex={scorerIndex}
              onErrorChange={setError}
            />

            {tabParam === 'trends' && (
              <Card className="p-4">
                <div className="text-xs uppercase tracking-widest text-text-muted font-semibold mb-3">Run trend</div>
                {runsTrendData.length === 0 ? (
                  <div className="text-sm text-text-muted">No runs yet.</div>
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={runsTrendData}>
                        <XAxis dataKey="created_at" tickFormatter={(value) => new Date(value).toLocaleDateString()} />
                        <YAxis domain={[0, 1]} />
                        <Tooltip labelFormatter={(value) => new Date(value as number).toLocaleString()} />
                        <Line type="monotone" dataKey="avg_score" stroke="#6366f1" name="Primary avg" strokeWidth={2} />
                        <Line type="monotone" dataKey="weighted_avg_score" stroke="#10b981" name="Weighted avg" strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>
            )}
          </div>
        </div>
      </div>

      <ExperimentVersionForm
        open={showCreateVersion}
        models={models}
        scorers={scorers}
        draft={newVersion}
        onDraftChange={updateNewVersion}
        onToggleScorer={toggleNewScorer}
        onSetPrimaryScorer={setPrimaryScorer}
        onUpdateScorerConfig={updateScorerConfig}
        onClose={() => setShowCreateVersion(false)}
        onCreate={handleCreateVersion}
      />
      <ExperimentShareModal
        open={share.modalOpen}
        shareType={share.shareType}
        shareUrl={share.url}
        loading={share.loading}
        error={share.error}
        copied={share.copied}
        onClose={share.closeShare}
        onCopy={share.copyShare}
      />
    </div>
  );
};

export default ExperimentDetail;
