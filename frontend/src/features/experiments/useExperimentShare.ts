import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { getErrorMessage } from '../../lib/errors';
import type { Experiment, ExperimentRun } from '../../types';

interface UseExperimentShareOptions {
  experiment: Experiment | null;
  selectedRun: ExperimentRun | null;
}

function buildShareUrl(token: string, resultId?: string): string {
  const baseUrl = window.location.origin;
  const resultQuery = resultId ? `?result=${encodeURIComponent(resultId)}` : '';
  return `${baseUrl}/share-links/${token}${resultQuery}`;
}

export function useExperimentShare({ experiment, selectedRun }: UseExperimentShareOptions) {
  const [modalOpen, setModalOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [shareType, setShareType] = useState<'experiment' | 'result'>('experiment');
  const requestGeneration = useRef(0);

  useEffect(() => {
    requestGeneration.current += 1;
    setModalOpen(false);
    setUrl(null);
    setLoading(false);
    setError(null);
    setCopied(false);

    return () => {
      requestGeneration.current += 1;
    };
  }, [experiment?.id]);

  const openShare = useCallback(async (resultId?: string) => {
    if (!experiment || (resultId && !selectedRun)) return;

    const generation = ++requestGeneration.current;
    setModalOpen(true);
    setLoading(true);
    setError(null);
    setUrl(null);
    setCopied(false);
    setShareType(resultId ? 'result' : 'experiment');

    const shareTarget = resultId && selectedRun
      ? { object_type: 'experiment_run', object_id: selectedRun.id }
      : { object_type: 'experiment', object_id: experiment.id };

    try {
      const created = await api.createShareLink({
        project_id: experiment.project_id,
        ...shareTarget,
      });
      if (generation === requestGeneration.current) {
        setUrl(buildShareUrl(created.token, resultId));
      }
    } catch (cause: unknown) {
      if (generation === requestGeneration.current) {
        setError(getErrorMessage(cause, 'Failed to create share link'));
      }
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  }, [experiment, selectedRun]);

  const closeShare = useCallback(() => {
    requestGeneration.current += 1;
    setModalOpen(false);
    setLoading(false);
  }, []);

  const copyShare = useCallback(async () => {
    if (!url || !navigator.clipboard) return;

    const generation = requestGeneration.current;
    try {
      await navigator.clipboard.writeText(url);
      if (generation === requestGeneration.current) setCopied(true);
    } catch (cause: unknown) {
      if (generation === requestGeneration.current) {
        setError(getErrorMessage(cause, 'Unable to copy share link'));
      }
    }
  }, [url]);

  return {
    modalOpen,
    url,
    loading,
    error,
    copied,
    shareType,
    openShare,
    closeShare,
    copyShare,
  };
}
