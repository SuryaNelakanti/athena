import { useEffect, useMemo, useState } from 'react';

import { api } from '../../lib/api';
import { getErrorMessage } from '../../lib/errors';
import type { AgentSession } from '../../types';

export function useSessionListData(projectId: string) {
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [agentName, setAgentName] = useState('');
  const [env, setEnv] = useState('');
  const [status, setStatus] = useState('all');

  useEffect(() => {
    let active = true;
    setSessions([]);
    setLoadError(null);
    if (!projectId) {
      setLoading(false);
      return () => {
        active = false;
      };
    }

    setLoading(true);
    api
      .getSessions(projectId, {
        agent_name: agentName || undefined,
        env: env || undefined,
        status: status !== 'all' ? status : undefined,
        limit: 200,
      })
      .then((items) => {
        if (active) setSessions(items);
      })
      .catch((cause: unknown) => {
        if (active) setLoadError(getErrorMessage(cause, 'Failed to load agent runs.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [projectId, agentName, env, status]);

  const filteredSessions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return sessions;
    return sessions.filter((session) => (
      session.id.toLowerCase().includes(query) ||
      (session.agent_name || '').toLowerCase().includes(query) ||
      (session.env || '').toLowerCase().includes(query)
    ));
  }, [sessions, search]);

  const stats = useMemo(() => {
    const total = sessions.length;
    const active = sessions.filter((session) => session.status === 'active').length;
    const errors = sessions.reduce((count, session) => count + (session.error_count || 0), 0);
    return { total, active, errors };
  }, [sessions]);

  return {
    sessions: filteredSessions,
    loading,
    loadError,
    search,
    setSearch,
    agentName,
    setAgentName,
    env,
    setEnv,
    status,
    setStatus,
    stats,
  };
}
