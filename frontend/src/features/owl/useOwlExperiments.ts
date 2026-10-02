import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { getErrorMessage } from '../../lib/errors';
import type { Experiment } from '../../types';

export const useOwlExperiments = (projectId: string) => {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (!projectId) {
      setExperiments([]);
      setLoading(false);
      setError(null);
      return;
    }

    setExperiments([]);
    setLoading(true);
    setError(null);
    try {
      const nextExperiments = await api.getExperiments(projectId);
      if (requestId === requestIdRef.current) setExperiments(nextExperiments);
    } catch (cause: unknown) {
      if (requestId === requestIdRef.current) {
        setError(getErrorMessage(cause, 'Failed to load experiments'));
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
    return () => {
      requestIdRef.current += 1;
    };
  }, [load, reloadKey]);

  const options = useMemo(
    () => experiments.map((experiment) => ({
      value: experiment.id,
      label: experiment.name || experiment.id,
    })),
    [experiments]
  );
  const reload = useCallback(() => setReloadKey((current) => current + 1), []);

  return { experiments, loading, error, options, reload };
};
