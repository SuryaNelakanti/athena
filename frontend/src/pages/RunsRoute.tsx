import React, { useEffect, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';

import type { AgentSessionDetail } from '../types';
import { api } from '../lib/api';
import { getErrorMessage } from '../lib/errors';
import RunDetail from './RunDetail';
import SessionDetail from './SessionDetail';
import SessionList from './SessionList';

const RunsRoute: React.FC = () => {
  const search = useSearch({ from: '/runs' });
  const navigate = useNavigate({ from: '/runs' });
  const sessionId = search.session_id;
  const runId = search.run_id;
  const [selectedSession, setSelectedSession] = useState<AgentSessionDetail | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setSelectedSession(null);
      setSessionError(null);
      setSessionLoading(false);
      return;
    }

    let canceled = false;
    setSelectedSession(null);
    setSessionError(null);
    setSessionLoading(true);
    api.getSession(sessionId)
      .then((data) => {
        if (!canceled) setSelectedSession(data);
      })
      .catch((cause: unknown) => {
        if (!canceled) {
          setSelectedSession(null);
          setSessionError(getErrorMessage(cause, 'Failed to load session.'));
        }
      })
      .finally(() => {
        if (!canceled) setSessionLoading(false);
      });

    return () => {
      canceled = true;
    };
  }, [sessionId]);

  const setParam = (key: 'session_id' | 'run_id', value: string | null) => {
    navigate({
      search: (previous) => ({ ...previous, [key]: value || undefined }),
    });
  };

  if (runId) {
    return (
      <RunDetail
        runId={runId}
        onBack={(nextSessionId) => {
          setParam('run_id', null);
          if (nextSessionId) setParam('session_id', nextSessionId);
        }}
        onOpenTrace={(traceId) => navigate({ to: '/logs', search: { trace_id: traceId } })}
      />
    );
  }

  if (sessionId) {
    if (sessionLoading) {
      return (
        <div className="flex items-center justify-center h-full text-text-muted">
          Loading session...
        </div>
      );
    }
    if (!selectedSession) {
      return (
        <div
          role={sessionError ? 'alert' : undefined}
          className="flex items-center justify-center h-full text-text-muted"
        >
          {sessionError || 'Session not found.'}
        </div>
      );
    }
    return (
      <SessionDetail
        session={selectedSession.session}
        runs={selectedSession.runs}
        onBack={() => setParam('session_id', null)}
        onOpenRun={(nextRunId) => setParam('run_id', nextRunId)}
      />
    );
  }

  return (
    <SessionList
      selectedSessionId={sessionId}
      onOpenRun={(nextRunId) => setParam('run_id', nextRunId)}
      onSelectSession={(session) => setParam('session_id', session.id)}
    />
  );
};

export default RunsRoute;
