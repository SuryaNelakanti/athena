import React, { useEffect, useMemo, useState } from 'react';
import { AgentSession } from '../../types';
import { api } from '../../services/api';
import { Badge, Button, Card, Input, Select } from '../ui';
import { PageHeader } from '../layout/PageHeader';
import {
  QueueListIcon,
  MagnifyingGlassIcon,
  ArrowTopRightOnSquareIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  PlayCircleIcon,
} from '@heroicons/react/24/outline';

interface SessionListProps {
  projectId: string;
  selectedSessionId?: string | null;
  onSelectSession: (session: AgentSession) => void;
  onOpenRun?: (runId: string) => void;
}

const formatTimestamp = (value?: number | null) => {
  if (!value) return '--';
  const date = new Date(value);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  // If less than 24 hours ago, show relative time
  if (diff < 24 * 60 * 60 * 1000) {
    const hours = Math.floor(diff / (60 * 60 * 1000));
    const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
    if (hours > 0) return `${hours}h ${minutes}m ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  }

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const statusVariant = (status: string): 'neutral' | 'primary' | 'success' | 'warning' | 'danger' => {
  switch (status) {
    case 'error':
      return 'danger';
    case 'active':
      return 'primary';
    case 'completed':
      return 'success';
    default:
      return 'neutral';
  }
};

const SessionList: React.FC<SessionListProps> = ({
  projectId,
  selectedSessionId,
  onSelectSession,
  onOpenRun,
}) => {
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [agentName, setAgentName] = useState('');
  const [env, setEnv] = useState('');
  const [status, setStatus] = useState('all');

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    api
      .getSessions(projectId, {
        agent_name: agentName || undefined,
        env: env || undefined,
        status: status !== 'all' ? status : undefined,
        limit: 200,
      })
      .then(setSessions)
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, [projectId, agentName, env, status]);

  const filteredSessions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return sessions;
    return sessions.filter((session) => {
      return (
        session.id.toLowerCase().includes(query) ||
        (session.agent_name || '').toLowerCase().includes(query) ||
        (session.env || '').toLowerCase().includes(query)
      );
    });
  }, [sessions, search]);

  const stats = useMemo(() => {
    const total = sessions.length;
    const active = sessions.filter((s) => s.status === 'active').length;
    const errors = sessions.reduce((acc, s) => acc + (s.error_count || 0), 0);
    return { total, active, errors };
  }, [sessions]);

  return (
    <div className="h-full flex flex-col bg-app">
      <PageHeader
        title="Agent Runs"
        subtitle="Run groups that capture agent trajectories and outcomes"
      />

      {/* Stats Row */}
      <div className="px-6 py-4 flex items-center gap-4 border-b border-border-hairline bg-panel">
        <div className="flex items-center gap-2">
          <span className="icon-chip icon-chip--slate">
            <QueueListIcon className="w-4 h-4" />
          </span>
          <div>
            <div className="text-2xl font-bold text-text-main">{stats.total}</div>
            <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold">Total Sessions</div>
          </div>
        </div>
        <div className="w-px h-10 bg-border-hairline" />
        <div className="flex items-center gap-2">
          <span className="icon-chip icon-chip--mint">
            <PlayCircleIcon className="w-4 h-4" />
          </span>
          <div>
            <div className="text-2xl font-bold text-text-main">{stats.active}</div>
            <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold">Active</div>
          </div>
        </div>
        <div className="w-px h-10 bg-border-hairline" />
        <div className="flex items-center gap-2">
          <span className="icon-chip icon-chip--rose">
            <ExclamationTriangleIcon className="w-4 h-4" />
          </span>
          <div>
            <div className="text-2xl font-bold text-text-main">{stats.errors}</div>
            <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold">Errors</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="px-6 py-4 flex flex-wrap gap-3 border-b border-border-hairline bg-panel">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search sessions..."
            className="pl-9"
          />
        </div>
        <Input
          value={agentName}
          onChange={(e) => setAgentName(e.target.value)}
          placeholder="Agent name"
          className="w-40"
        />
        <Input
          value={env}
          onChange={(e) => setEnv(e.target.value)}
          placeholder="Environment"
          className="w-32"
        />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-36">
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="error">Error</option>
        </Select>
      </div>

      {/* Session Cards */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-text-muted text-sm animate-pulse">
            Loading agent runs...
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-text-muted animate-soft-in">
            <div className="icon-chip icon-chip--slate icon-chip-lg mb-4">
              <QueueListIcon className="w-5 h-5" />
            </div>
            <h3 className="text-text-main font-semibold mb-1">No agent runs yet</h3>
            <p className="text-sm">Ingest agent runs to see trajectories here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredSessions.map((session, index) => {
              const isActive = session.id === selectedSessionId;
              const runCount = session.run_count ?? 0;
              const errorCount = session.error_count ?? 0;
              const lastRunId = session.last_run_id;

              return (
                <Card
                  key={session.id}
                  hoverable
                  onClick={() => onSelectSession(session)}
                  className={`relative overflow-hidden transition-all duration-200 animate-soft-in ${isActive ? 'ring-2 ring-primary shadow-glow' : ''
                    }`}
                  style={{ animationDelay: `${index * 30}ms` }}
                >
                  {/* Status indicator bar */}
                  <div
                    className={`absolute top-0 left-0 right-0 h-1 ${session.status === 'error'
                        ? 'bg-rose-500'
                        : session.status === 'active'
                          ? 'bg-primary'
                          : 'bg-emerald-500'
                      }`}
                  />

                  <div className="pt-3">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <h3 className="text-sm font-semibold text-text-main truncate">
                          {session.agent_name || 'Unnamed agent'}
                        </h3>
                        {session.env && (
                          <span className="shrink-0 text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full bg-app border border-border-base text-text-muted font-medium">
                            {session.env}
                          </span>
                        )}
                      </div>
                      <Badge variant={statusVariant(session.status)}>{session.status}</Badge>
                    </div>

                    {/* Session ID */}
                    <p className="text-xs text-text-muted mb-4 font-mono truncate">
                      {session.id}
                    </p>

                    {/* Stats */}
                    <div className="flex items-center gap-4 text-xs mb-4">
                      <div className="flex items-center gap-1.5">
                        <QueueListIcon className="w-3.5 h-3.5 text-text-muted" />
                        <span className="text-text-main font-medium">{runCount}</span>
                        <span className="text-text-muted">runs</span>
                      </div>
                      {errorCount > 0 && (
                        <div className="flex items-center gap-1.5">
                          <ExclamationTriangleIcon className="w-3.5 h-3.5 text-rose-500" />
                          <span className="text-rose-500 font-medium">{errorCount}</span>
                          <span className="text-rose-400">errors</span>
                        </div>
                      )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-3 border-t border-border-hairline">
                      <div className="flex items-center gap-1.5 text-xs text-text-muted">
                        <ClockIcon className="w-3.5 h-3.5" />
                        <span>{formatTimestamp(session.last_run_at)}</span>
                      </div>
                      {lastRunId && onOpenRun && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenRun(lastRunId);
                          }}
                        >
                          <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
                          Last Run
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default SessionList;
