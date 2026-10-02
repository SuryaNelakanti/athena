import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { getErrorMessage } from '../../lib/errors';
import type { AqlBuilder } from '../../types';
import type { ChartMode } from './aql';
import type { ChartRow } from './metrics';

interface UseDashboardChartPreviewOptions {
  requestKey: string;
  chartMode: ChartMode;
  guidedBuilder: AqlBuilder;
  query: string;
}

export interface DashboardChartPreviewState {
  previewRows: ChartRow[];
  previewQuery: string;
  previewError: string | null;
  previewLoading: boolean;
  clearPreview: () => void;
  handlePreviewChart: () => Promise<void>;
}

export function useDashboardChartPreview({
  requestKey,
  chartMode,
  guidedBuilder,
  query,
}: UseDashboardChartPreviewOptions): DashboardChartPreviewState {
  const [previewRows, setPreviewRows] = useState<ChartRow[]>([]);
  const [previewQuery, setPreviewQuery] = useState('');
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const requestId = useRef(0);
  const currentRequestKey = useRef(requestKey);
  currentRequestKey.current = requestKey;

  const clearPreview = useCallback(() => {
    requestId.current += 1;
    setPreviewRows([]);
    setPreviewQuery('');
    setPreviewError(null);
    setPreviewLoading(false);
  }, []);

  useEffect(() => {
    clearPreview();
  }, [clearPreview, requestKey]);

  useEffect(() => () => {
    requestId.current += 1;
  }, []);

  const handlePreviewChart = useCallback(async () => {
    const requestIdAtStart = requestId.current + 1;
    const requestKeyAtStart = requestKey;
    requestId.current = requestIdAtStart;
    setPreviewLoading(true);
    setPreviewError(null);

    try {
      const payload = chartMode === 'guided' ? { builder: guidedBuilder } : query;
      const result = await api.runAqlQuery(payload);
      if (requestId.current !== requestIdAtStart || currentRequestKey.current !== requestKeyAtStart) {
        return;
      }
      setPreviewRows(result.data || []);
      setPreviewQuery(result.query || '');
    } catch (cause: unknown) {
      if (requestId.current !== requestIdAtStart || currentRequestKey.current !== requestKeyAtStart) {
        return;
      }
      setPreviewRows([]);
      setPreviewQuery('');
      setPreviewError(getErrorMessage(cause, 'Failed to preview query'));
    } finally {
      if (requestId.current === requestIdAtStart && currentRequestKey.current === requestKeyAtStart) {
        setPreviewLoading(false);
      }
    }
  }, [chartMode, guidedBuilder, query, requestKey]);

  return {
    previewRows,
    previewQuery,
    previewError,
    previewLoading,
    clearPreview,
    handlePreviewChart,
  };
}
