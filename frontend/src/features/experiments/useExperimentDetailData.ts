import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { api } from '../../lib/api';
import { getErrorMessage } from '../../lib/errors';
import type {
  Dataset,
  DatasetRow,
  Experiment,
  ExperimentRun,
  ExperimentRunResult,
  ExperimentVersion,
  Function,
  ModelRegistry,
} from '../../types';

type SearchKey = 'version' | 'run';
type SetSearchParam = (key: SearchKey, value: string | null, replace?: boolean) => void;

interface UseExperimentDetailDataOptions {
  experimentId: string;
  projectId: string;
  versionId?: string;
  runId?: string;
  setSearchParam: SetSearchParam;
}

interface LoadedItems<T> {
  selectionId: string;
  items: T[];
}

export function useExperimentDetailData({
  experimentId,
  projectId,
  versionId,
  runId,
  setSearchParam,
}: UseExperimentDetailDataOptions) {
  const [experiment, setExperiment] = useState<Experiment | null>(null);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [models, setModels] = useState<ModelRegistry[]>([]);
  const [scorers, setScorers] = useState<Function[]>([]);
  const [versions, setVersions] = useState<ExperimentVersion[]>([]);
  const [versionRuns, setVersionRuns] = useState<LoadedItems<ExperimentRun> | null>(null);
  const [runResults, setRunResults] = useState<LoadedItems<ExperimentRunResult> | null>(null);
  const [pinnedDatasetRows, setPinnedDatasetRows] = useState<LoadedItems<DatasetRow> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const versionRunsRequest = useRef(0);

  useEffect(() => {
    if (!experimentId) {
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);
    setExperiment(null);
    setDataset(null);
    setModels([]);
    setScorers([]);
    setVersions([]);
    setVersionRuns(null);
    setRunResults(null);
    setPinnedDatasetRows(null);

    const load = async () => {
      try {
        const [modelsData, versionsData, scorersData, experimentData] = await Promise.all([
          api.getModelRegistry(true),
          api.getExperimentVersions(experimentId),
          api.getScorers(projectId),
          api.getExperiment(experimentId),
        ]);
        if (!active) return;

        setModels(modelsData);
        setVersions(versionsData);
        setScorers(scorersData.filter((scorer) => scorer.type === 'scorer' && scorer.enabled));
        setExperiment(experimentData);

        if (experimentData?.dataset_id) {
          const datasetData = await api.getDataset(experimentData.dataset_id);
          if (active) setDataset(datasetData);
        }
      } catch (cause: unknown) {
        if (active) setError(getErrorMessage(cause, 'Failed to load experiment'));
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [experimentId, projectId]);

  const mainVersionId = experiment?.summary.main_version_id;

  useEffect(() => {
    if (!versions.length) return;
    const versionIsValid = versionId && versions.some((version) => version.id === versionId);
    if (versionIsValid) return;

    const fallbackVersionId = mainVersionId && versions.some((version) => version.id === mainVersionId)
      ? mainVersionId
      : versions[0].id;
    setSearchParam('version', fallbackVersionId, true);
  }, [versions, versionId, mainVersionId, setSearchParam]);

  const selectedVersion = useMemo(
    () => versions.find((version) => version.id === versionId) ?? null,
    [versions, versionId],
  );

  useEffect(() => {
    const selectedVersionId = selectedVersion?.id;
    if (!experimentId || !selectedVersionId) {
      setVersionRuns(null);
      return;
    }

    let active = true;
    const requestId = ++versionRunsRequest.current;
    api.getVersionRuns(experimentId, selectedVersionId)
      .then((items) => {
        if (active && requestId === versionRunsRequest.current) {
          setVersionRuns({ selectionId: selectedVersionId, items });
        }
      })
      .catch((cause: unknown) => {
        if (!active || requestId !== versionRunsRequest.current) return;
        setVersionRuns({ selectionId: selectedVersionId, items: [] });
        setError(getErrorMessage(cause, 'Failed to load runs'));
      });

    return () => {
      active = false;
    };
  }, [experimentId, selectedVersion?.id]);

  const runsLoaded = Boolean(selectedVersion && versionRuns?.selectionId === selectedVersion.id);
  const runs = runsLoaded ? versionRuns?.items ?? [] : [];

  useEffect(() => {
    if (!selectedVersion || !runsLoaded) return;
    if (!runs.length) {
      setSearchParam('run', null, true);
      return;
    }

    const runIsValid = runId && runs.some((run) => run.id === runId);
    if (!runIsValid) setSearchParam('run', runs[0].id, true);
  }, [selectedVersion, runsLoaded, runs, runId, setSearchParam]);

  const selectedRun = useMemo(
    () => runs.find((run) => run.id === runId) ?? null,
    [runs, runId],
  );

  useEffect(() => {
    if (!selectedRun) {
      setRunResults(null);
      return;
    }

    const selectedRunId = selectedRun.id;
    let active = true;
    api.getRunResults(selectedRunId)
      .then((items) => {
        if (active) setRunResults({ selectionId: selectedRunId, items });
      })
      .catch((cause: unknown) => {
        if (active) {
          setRunResults({ selectionId: selectedRunId, items: [] });
          setError(getErrorMessage(cause, 'Failed to load results'));
        }
      });

    return () => {
      active = false;
    };
  }, [selectedRun?.id]);

  useEffect(() => {
    const datasetId = experiment?.dataset_id;
    if (!datasetId || !selectedVersion) {
      setPinnedDatasetRows(null);
      return;
    }

    const selectionId = `${datasetId}:${selectedVersion.dataset_version_pinned ?? 'latest'}`;
    let active = true;
    api.getDatasetRows(datasetId, {
      row_kind: 'eval',
      at_version: selectedVersion.dataset_version_pinned,
    })
      .then((items) => {
        if (active) setPinnedDatasetRows({ selectionId, items });
      })
      .catch((cause: unknown) => {
        if (active) {
          setPinnedDatasetRows({ selectionId, items: [] });
          setError(getErrorMessage(cause, 'Failed to load dataset rows'));
        }
      });

    return () => {
      active = false;
    };
  }, [experiment?.dataset_id, selectedVersion?.id, selectedVersion?.dataset_version_pinned]);

  const datasetRowsSelectionId = experiment?.dataset_id && selectedVersion
    ? `${experiment.dataset_id}:${selectedVersion.dataset_version_pinned ?? 'latest'}`
    : null;
  const results = runResults && runResults.selectionId === selectedRun?.id ? runResults.items : [];
  const datasetRows = pinnedDatasetRows?.selectionId === datasetRowsSelectionId
    ? pinnedDatasetRows.items
    : [];

  const setRuns: Dispatch<SetStateAction<ExperimentRun[]>> = useCallback((action) => {
    const selectedVersionId = selectedVersion?.id;
    if (!selectedVersionId) return;

    versionRunsRequest.current += 1;
    setVersionRuns((current) => {
      const currentRuns = current?.selectionId === selectedVersionId ? current.items : [];
      const items = typeof action === 'function' ? action(currentRuns) : action;
      return { selectionId: selectedVersionId, items };
    });
  }, [selectedVersion?.id]);

  return {
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
  };
}
