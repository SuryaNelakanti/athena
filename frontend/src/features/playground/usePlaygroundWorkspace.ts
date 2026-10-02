import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { getErrorMessage } from '../../lib/errors';
import type { Dataset, ModelRegistry, Playground } from '../../types';

export const usePlaygroundWorkspace = (projectId: string) => {
  const [playgrounds, setPlaygrounds] = useState<Playground[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [modelRegistry, setModelRegistry] = useState<ModelRegistry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const loadWorkspace = useCallback(async (clearCurrentData: boolean, fallbackMessage: string) => {
    const requestId = ++requestIdRef.current;
    if (clearCurrentData) {
      setPlaygrounds([]);
      setDatasets([]);
      setModelRegistry([]);
    }
    setLoading(true);
    setError(null);

    try {
      const [nextPlaygrounds, nextDatasets, nextModelRegistry] = await Promise.all([
        api.getPlaygrounds(projectId),
        api.getDatasets(projectId),
        api.getModelRegistry(true),
      ]);
      if (requestId !== requestIdRef.current) return;
      setPlaygrounds(nextPlaygrounds);
      setDatasets(nextDatasets);
      setModelRegistry(nextModelRegistry);
    } catch (cause: unknown) {
      if (requestId === requestIdRef.current) setError(getErrorMessage(cause, fallbackMessage));
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId) {
      setPlaygrounds([]);
      setDatasets([]);
      setModelRegistry([]);
      setLoading(false);
      setError(null);
      return;
    }

    void loadWorkspace(true, 'Failed to load playground data');
    return () => {
      requestIdRef.current += 1;
    };
  }, [loadWorkspace, projectId]);

  const refresh = useCallback(() => {
    if (!projectId) return Promise.resolve();
    return loadWorkspace(false, 'Failed to refresh playground data');
  }, [loadWorkspace, projectId]);

  return { playgrounds, datasets, modelRegistry, loading, error, refresh };
};
