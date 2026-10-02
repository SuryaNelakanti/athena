import { useCallback, useEffect, useRef, useState } from 'react';
import type { DatasetRow, PromptTest, PromptTestResult } from '../../types';
import { api } from '../../lib/api';
import { getErrorMessage } from '../../lib/errors';

export const usePromptTestDetailData = (promptTestId: string) => {
  const [test, setTest] = useState<PromptTest | null>(null);
  const [results, setResults] = useState<PromptTestResult[]>([]);
  const [rows, setRows] = useState<Record<string, DatasetRow>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const testRef = useRef(test);
  const loadedTestIdRef = useRef<string | null>(null);
  testRef.current = test;

  useEffect(() => {
    let active = true;
    let inFlight = false;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let lastKnownStatus = testRef.current?.id === promptTestId
      ? testRef.current.status
      : undefined;

    const selectionChanged = loadedTestIdRef.current !== promptTestId;
    loadedTestIdRef.current = promptTestId;
    if (selectionChanged) {
      setTest(null);
      setResults([]);
      setRows({});
    }
    setLoading(true);
    setError(null);

    const load = async () => {
      if (!active || inFlight) return;
      inFlight = true;

      try {
        const testData = await api.getPromptTest(promptTestId);
        if (!active) return;
        lastKnownStatus = testData.status;
        setTest(testData);

        const resultsData = await api.getPromptTestResults(promptTestId);
        if (!active) return;
        setResults(resultsData);

        const rowsData = testData.dataset_id
          ? await api.getDatasetRows(testData.dataset_id)
          : [];
        if (!active) return;

        const rowMap: Record<string, DatasetRow> = {};
        for (const row of rowsData) rowMap[row.id] = row;
        setRows(rowMap);
        setError(null);
      } catch (cause: unknown) {
        if (active) setError(getErrorMessage(cause, 'Failed to load prompt test.'));
      } finally {
        inFlight = false;
        if (active) {
          setLoading(false);
          if (lastKnownStatus === 'running' || lastKnownStatus === 'pending') {
            pollTimer = setTimeout(() => void load(), 3000);
          }
        }
      }
    };

    void load();
    return () => {
      active = false;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [promptTestId, refreshVersion]);

  const markPendingAndRefresh = useCallback((expectedTestId: string) => {
    setTest((current) => (
      current?.id === expectedTestId ? { ...current, status: 'pending' } : current
    ));
    setRefreshVersion((current) => current + 1);
  }, []);

  return {
    test,
    results,
    rows,
    loading,
    error,
    markPendingAndRefresh,
  };
};
