import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { api } from '../../lib/api';
import { getErrorMessage } from '../../lib/errors';
import type { ExperimentRun, ExperimentVersion } from '../../types';

interface UseExperimentRunActionsOptions {
  experimentId: string;
  selectedVersion: ExperimentVersion | null;
  setRuns: Dispatch<SetStateAction<ExperimentRun[]>>;
  setRunId: (runId: string) => void;
  onErrorChange: (message: string | null) => void;
}

export function useExperimentRunActions({
  experimentId,
  selectedVersion,
  setRuns,
  setRunId,
  onErrorChange,
}: UseExperimentRunActionsOptions) {
  const requestGeneration = useRef(0);
  const versionId = selectedVersion?.id;
  const selectionKey = `${experimentId}:${versionId ?? ''}`;

  useEffect(() => {
    requestGeneration.current += 1;
    return () => {
      requestGeneration.current += 1;
    };
  }, [selectionKey]);

  const runSelectedVersion = useCallback(async () => {
    if (!experimentId || !versionId) return;

    const generation = requestGeneration.current;
    onErrorChange(null);
    try {
      const created = await api.createVersionRun(experimentId, versionId);
      if (generation !== requestGeneration.current) return;

      setRuns((current) => [created, ...current]);
      setRunId(created.id);
    } catch (cause: unknown) {
      if (generation === requestGeneration.current) {
        onErrorChange(getErrorMessage(cause, 'Failed to run version'));
      }
    }
  }, [experimentId, versionId, setRuns, setRunId, onErrorChange]);

  const cancelRun = useCallback(async (runId: string) => {
    const generation = requestGeneration.current;
    onErrorChange(null);
    try {
      const updated = await api.cancelRun(runId);
      if (generation !== requestGeneration.current) return;

      setRuns((current) => current.map((run) => (
        run.id === updated.id ? updated : run
      )));
    } catch (cause: unknown) {
      if (generation === requestGeneration.current) {
        onErrorChange(getErrorMessage(cause, 'Failed to cancel run'));
      }
    }
  }, [setRuns, onErrorChange]);

  return { runSelectedVersion, cancelRun };
}
