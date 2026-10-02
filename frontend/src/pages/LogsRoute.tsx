import React, { useEffect, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';

import type { Trace } from '../types';
import { api } from '../lib/api';
import { getErrorMessage } from '../lib/errors';
import LogTable from './LogTable';
import TraceDetail from './TraceDetail';

const LogsRoute: React.FC = () => {
  const search = useSearch({ from: '/logs' });
  const navigate = useNavigate({ from: '/logs' });
  const traceId = search.trace_id;
  const logId = search.log_id;
  const [selectedTrace, setSelectedTrace] = useState<Trace | null>(null);
  const [traceLoading, setTraceLoading] = useState(false);
  const [traceError, setTraceError] = useState<string | null>(null);

  useEffect(() => {
    if (!traceId) {
      setSelectedTrace(null);
      setTraceError(null);
      setTraceLoading(false);
      return;
    }

    let canceled = false;
    setTraceLoading(true);
    setTraceError(null);
    setSelectedTrace(null);
    api.getTrace(traceId)
      .then((trace) => {
        if (!canceled) setSelectedTrace(trace);
      })
      .catch((cause: unknown) => {
        if (!canceled) {
          setSelectedTrace(null);
          setTraceError(getErrorMessage(cause, 'Failed to load trace.'));
        }
      })
      .finally(() => {
        if (!canceled) setTraceLoading(false);
      });

    return () => {
      canceled = true;
    };
  }, [traceId]);

  const setParam = (key: 'trace_id' | 'log_id', value: string | null) => {
    navigate({
      search: (previous) => ({ ...previous, [key]: value || undefined }),
    });
  };

  const showDetail = Boolean(traceId);

  return (
    <div className="flex h-full">
      <div className={`${showDetail ? 'w-1/2 hidden md:block' : 'w-full'} border-r border-border-base transition-all`}>
        <LogTable
          onSelectLog={(log) => setParam('log_id', log.id)}
          onOpenTrace={(nextTraceId) => setParam('trace_id', nextTraceId)}
          selectedLogId={logId}
        />
      </div>
      {showDetail && (
        <div className="w-full md:w-1/2 absolute md:static inset-0 z-20 md:z-auto bg-panel animate-slide-in-right">
          {traceLoading && !selectedTrace ? (
            <div className="flex items-center justify-center h-full text-text-muted">
              Loading trace...
            </div>
          ) : selectedTrace ? (
            <TraceDetail
              trace={selectedTrace}
              onClose={() => setParam('trace_id', null)}
              onOpenTrace={(nextTraceId) => setParam('trace_id', nextTraceId)}
            />
          ) : (
            <div
              role={traceError ? 'alert' : undefined}
              className="flex items-center justify-center h-full text-text-muted"
            >
              {traceError || 'Trace not found.'}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default LogsRoute;
