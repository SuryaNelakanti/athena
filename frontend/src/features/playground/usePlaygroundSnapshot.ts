import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { getErrorMessage } from '../../lib/errors';
import type { ModelRegistry } from '../../types';
import type { PlaygroundVariant, SnapshotStatus } from './model';

type UsePlaygroundSnapshotOptions = {
  projectId: string;
  datasetId: string;
  variantId: string;
  snapshotName: string;
  variants: PlaygroundVariant[];
  modelRegistry: ModelRegistry[];
  systemPrompt: string;
};

export const usePlaygroundSnapshot = ({
  projectId,
  datasetId,
  variantId,
  snapshotName,
  variants,
  modelRegistry,
  systemPrompt,
}: UsePlaygroundSnapshotOptions) => {
  const [status, setStatus] = useState<SnapshotStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [experimentId, setExperimentId] = useState<string | null>(null);
  const statusRef = useRef<SnapshotStatus>('idle');
  const updateStatus = useCallback((nextStatus: SnapshotStatus) => {
    statusRef.current = nextStatus;
    setStatus(nextStatus);
  }, []);
  const resetSnapshot = useCallback(() => {
    updateStatus('idle');
    setError(null);
    setExperimentId(null);
  }, [updateStatus]);

  useEffect(() => {
    if (statusRef.current === 'saving') return;
    resetSnapshot();
  }, [datasetId, variantId, snapshotName, resetSnapshot]);

  const createSnapshot = useCallback(async (playgroundName: string) => {
    if (!projectId || !datasetId || !variantId || !snapshotName.trim()) return;
    updateStatus('saving');
    setError(null);
    setExperimentId(null);

    try {
      const variant = variants.find((item) => item.id === variantId);
      if (!variant) throw new Error('Select a variant to snapshot');

      const model =
        modelRegistry.find(
          (item) => item.model_id === variant.model && (!variant.provider || item.provider === variant.provider)
        ) || modelRegistry.find((item) => item.model_id === variant.model);
      if (!model) throw new Error('Selected model is not in the registry');

      const experiment = await api.createExperiment({
        project_id: projectId,
        dataset_id: datasetId,
        name: snapshotName.trim(),
      });

      await api.createExperimentVersion(experiment.id, {
        model_registry_id: model.id,
        temperature: variant.temperature,
        max_tokens: variant.max_tokens ?? undefined,
        top_p: variant.top_p,
        system_prompt: systemPrompt,
        notes: `Snapshot from playground ${playgroundName}`,
      });

      updateStatus('success');
      setExperimentId(experiment.id);
    } catch (cause: unknown) {
      updateStatus('error');
      setError(getErrorMessage(cause, 'Failed to snapshot experiment'));
    }
  }, [
    projectId,
    datasetId,
    variantId,
    snapshotName,
    variants,
    modelRegistry,
    systemPrompt,
    updateStatus,
  ]);

  return { status, error, experimentId, createSnapshot, resetSnapshot };
};
