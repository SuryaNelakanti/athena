import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dataset, DatasetRow, DatasetVersion } from '../../types';
import { api } from '../../lib/api';
import { getErrorMessage } from '../../lib/errors';

export const useDatasetDetailData = (datasetId: string, activeTab: string) => {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [rows, setRows] = useState<DatasetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [datasetLoading, setDatasetLoading] = useState(true);
  const [datasetError, setDatasetError] = useState<string | null>(null);
  const [rowsError, setRowsError] = useState<string | null>(null);
  const [history, setHistory] = useState<DatasetVersion[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [rowHistory, setRowHistory] = useState<Record<string, DatasetRow[]>>({});
  const [rowHistoryErrors, setRowHistoryErrors] = useState<Record<string, string>>({});
  const datasetIdRef = useRef(datasetId);
  datasetIdRef.current = datasetId;

  const loadRows = useCallback(async (activeDataset: Dataset) => {
    if (datasetIdRef.current !== activeDataset.id) return;
    setLoading(true);
    setRowsError(null);
    try {
      const data = await api.getDatasetRows(activeDataset.id);
      if (datasetIdRef.current === activeDataset.id) setRows(data);
    } catch (cause: unknown) {
      if (datasetIdRef.current === activeDataset.id) {
        setRowsError(getErrorMessage(cause, 'Failed to load dataset rows.'));
      }
    } finally {
      if (datasetIdRef.current === activeDataset.id) setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async (activeDataset: Dataset) => {
    if (datasetIdRef.current !== activeDataset.id) return;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const data = await api.getDatasetHistory(activeDataset.id);
      if (datasetIdRef.current === activeDataset.id) setHistory(data);
    } catch (cause: unknown) {
      if (datasetIdRef.current === activeDataset.id) {
        setHistoryError(getErrorMessage(cause, 'Failed to load dataset history.'));
      }
    } finally {
      if (datasetIdRef.current === activeDataset.id) setHistoryLoading(false);
    }
  }, []);

  const loadRowHistory = useCallback(async (activeDatasetId: string, logicalId: string) => {
    if (datasetIdRef.current !== activeDatasetId) return;
    setRowHistoryErrors((current) => {
      const next = { ...current };
      delete next[logicalId];
      return next;
    });
    try {
      const data = await api.getDatasetRowHistory(activeDatasetId, logicalId);
      if (datasetIdRef.current === activeDatasetId) {
        setRowHistory((current) => ({ ...current, [logicalId]: data }));
      }
    } catch (cause: unknown) {
      if (datasetIdRef.current === activeDatasetId) {
        setRowHistoryErrors((current) => ({
          ...current,
          [logicalId]: getErrorMessage(cause, 'Failed to load row history.'),
        }));
      }
    }
  }, []);

  useEffect(() => {
    let active = true;
    setDataset(null);
    setRows([]);
    setHistory([]);
    setRowHistory({});
    setRowHistoryErrors({});
    setDatasetError(null);
    setRowsError(null);
    setHistoryError(null);
    setDatasetLoading(Boolean(datasetId));
    setLoading(Boolean(datasetId));

    if (!datasetId) {
      return () => {
        active = false;
      };
    }

    const loadDataset = async () => {
      try {
        const data = await api.getDataset(datasetId);
        if (!active || datasetIdRef.current !== datasetId) return;
        setDataset(data);
        await loadRows(data);
      } catch (cause: unknown) {
        if (active && datasetIdRef.current === datasetId) {
          setDatasetError(getErrorMessage(cause, 'Failed to load dataset.'));
        }
      } finally {
        if (active && datasetIdRef.current === datasetId) setDatasetLoading(false);
      }
    };

    void loadDataset();
    return () => {
      active = false;
    };
  }, [datasetId, loadRows]);

  useEffect(() => {
    if (dataset && activeTab === 'history') void loadHistory(dataset);
  }, [dataset, activeTab, loadHistory]);

  const selectedDataset = dataset?.id === datasetId ? dataset : null;
  const selectedDatasetLoading = Boolean(datasetId) && (
    datasetLoading || (!selectedDataset && !datasetError)
  );

  return {
    dataset: selectedDataset,
    rows,
    loading,
    datasetLoading: selectedDatasetLoading,
    datasetError,
    rowsError,
    history,
    historyLoading,
    historyError,
    rowHistory,
    rowHistoryErrors,
    loadRows,
    loadHistory,
    loadRowHistory,
  };
};
