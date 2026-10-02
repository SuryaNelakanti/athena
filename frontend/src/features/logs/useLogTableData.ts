import { useEffect, useState } from 'react';

import { api } from '../../lib/api';
import { getErrorMessage } from '../../lib/errors';
import type { AqlBuilder, Log } from '../../types';
import { parseAqlLogRow } from './logParsing';
import { RESULT_LIMIT, type Filter } from './filterConfig';
import type { TraceLineage } from './logTypes';

interface UseLogTableDataOptions {
  projectId: string;
  filters: Filter[];
  selectedLogId: string | null;
  onOpenTrace?: (traceId: string) => void;
}

const LOG_FIELDS = [
  'id',
  'project_id',
  'trace_id',
  'span_id',
  'status',
  'event_type',
  'message',
  'timestamp',
  'latency_ms',
  'prompt_tokens',
  'completion_tokens',
  'total_tokens',
  'cost',
  'model',
  'provider',
  'attributes',
  'log_metadata',
  'created_at',
];

const buildLogsQuery = (projectId: string, filters: Filter[]): AqlBuilder => ({
  shape: 'project_logs',
  params: { project_id: projectId },
  select: LOG_FIELDS,
  filters: filters
    .filter((filter) => filter.value.trim())
    .map(({ field, op, value }) => ({ field, op, value })),
  sort: { field: 'timestamp', direction: 'desc' },
  limit: RESULT_LIMIT,
});

const getTraceIds = (logs: Log[]): string[] => Array.from(
  new Set(
    logs
      .map((log) => log.trace_id)
      .filter((traceId): traceId is string => typeof traceId === 'string' && traceId.length > 0),
  ),
);

export function useLogTableData({
  projectId,
  filters,
  selectedLogId,
  onOpenTrace,
}: UseLogTableDataOptions) {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [traceLineage, setTraceLineage] = useState<Record<string, TraceLineage>>({});
  const [lineageLoading, setLineageLoading] = useState(false);
  const [lineageError, setLineageError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    let active = true;
    if (!projectId) {
      setLogs([]);
      setLoading(false);
      setError(null);
      return () => {
        active = false;
      };
    }

    setLoading(true);
    setError(null);
    const loadLogs = async () => {
      try {
        const result = await api.runAqlQuery({ builder: buildLogsQuery(projectId, filters) });
        if (!active) return;
        const nextLogs = result.shape === 'project_logs'
          ? result.data.flatMap((row) => {
              const parsedLog = parseAqlLogRow(row, projectId);
              return parsedLog ? [parsedLog] : [];
            })
          : [];
        setLogs(nextLogs);
      } catch (cause: unknown) {
        if (!active) return;
        setError(getErrorMessage(cause, 'Failed to load logs'));
        setLogs([]);
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadLogs();
    return () => {
      active = false;
    };
  }, [filters, projectId, refreshVersion]);

  useEffect(() => {
    if (!projectId || !selectedLogId || logs.some((log) => log.id === selectedLogId)) return;

    let active = true;
    api.getLog(selectedLogId)
      .then((log) => {
        if (!active) return;
        setLogs((currentLogs) => (
          currentLogs.some((item) => item.id === log.id) ? currentLogs : [log, ...currentLogs]
        ));
        if (log.trace_id) onOpenTrace?.(log.trace_id);
      })
      .catch((cause: unknown) => {
        if (active) setError(getErrorMessage(cause, 'Unable to load the selected log.'));
      });

    return () => {
      active = false;
    };
  }, [logs, onOpenTrace, projectId, selectedLogId]);

  useEffect(() => {
    let active = true;
    const traceIds = getTraceIds(logs).slice(0, 100);
    if (!projectId || traceIds.length === 0) {
      setTraceLineage({});
      setLineageLoading(false);
      setLineageError(null);
      return () => {
        active = false;
      };
    }

    setLineageLoading(true);
    setLineageError(null);
    const loadLineage = async () => {
      try {
        const [parents, children] = await Promise.all([
          api.runAqlQuery({
            builder: {
              shape: 'project_traces',
              params: { project_id: projectId },
              select: ['id', 'parent_trace_id'],
              filters: [{ field: 'id', op: 'in', value: traceIds }],
              limit: traceIds.length,
            },
          }),
          api.runAqlQuery({
            builder: {
              shape: 'project_traces',
              params: { project_id: projectId },
              dimensions: ['parent_trace_id'],
              measures: [{ func: 'count', field: '*', alias: 'child_count' }],
              filters: [{ field: 'parent_trace_id', op: 'in', value: traceIds }],
              limit: traceIds.length,
            },
          }),
        ]);
        if (!active) return;

        const nextLineage: Record<string, TraceLineage> = {};
        (parents.data || []).forEach((row) => {
          if (typeof row.id !== 'string' || !row.id) return;
          nextLineage[row.id] = {
            parent_trace_id: typeof row.parent_trace_id === 'string'
              ? row.parent_trace_id
              : null,
            child_count: 0,
          };
        });
        (children.data || []).forEach((row) => {
          const parentId = row.parent_trace_id;
          if (typeof parentId !== 'string' || !parentId) return;
          const count = typeof row.child_count === 'number'
            ? row.child_count
            : Number(row.child_count) || 0;
          nextLineage[parentId] = {
            parent_trace_id: nextLineage[parentId]?.parent_trace_id ?? null,
            child_count: count,
          };
        });
        setTraceLineage(nextLineage);
      } catch (cause: unknown) {
        if (!active) return;
        setTraceLineage({});
        setLineageError(getErrorMessage(cause, 'Unable to load trace lineage.'));
      } finally {
        if (active) setLineageLoading(false);
      }
    };

    void loadLineage();
    return () => {
      active = false;
    };
  }, [logs, projectId]);

  return {
    logs,
    loading,
    error,
    traceLineage,
    lineageLoading,
    lineageError,
    refreshLogs: () => setRefreshVersion((version) => version + 1),
  };
}
