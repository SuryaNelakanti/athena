import { useCallback, useRef, useState } from 'react';
import { getErrorMessage } from '../../lib/errors';
import { api } from '../../lib/api';
import type { Trace } from '../../types';

export const usePlaygroundTrace = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trace, setTrace] = useState<Trace | null>(null);
  const traceCacheRef = useRef<Record<string, Trace>>({});

  const openTrace = useCallback(async (traceId?: string) => {
    if (!traceId) return;

    setIsOpen(true);
    setError(null);
    setTrace(null);

    const cachedTrace = traceCacheRef.current[traceId];
    if (cachedTrace) {
      setTrace(cachedTrace);
      return;
    }

    setIsLoading(true);
    try {
      const loadedTrace = await api.getTrace(traceId);
      traceCacheRef.current[traceId] = loadedTrace;
      setTrace(loadedTrace);
    } catch (loadError: unknown) {
      setError(getErrorMessage(loadError, 'Failed to load trace'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const closeTrace = useCallback(() => {
    setIsOpen(false);
    setError(null);
    setTrace(null);
    setIsLoading(false);
  }, []);

  return { isOpen, isLoading, error, trace, openTrace, closeTrace };
};
