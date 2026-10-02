import type React from 'react';
import {
  ArrowTopRightOnSquareIcon,
  ClockIcon,
  CurrencyDollarIcon,
  ExclamationTriangleIcon,
  QueueListIcon,
} from '@heroicons/react/24/outline';

import { Badge, Button, Card } from '../../components/ui';
import type { AgentSession } from '../../types';
import { formatSessionTimestamp, getSessionStatusVariant } from './sessionListUtils';

type SessionListResultsProps = {
  sessions: AgentSession[];
  loading: boolean;
  error: string | null;
  selectedSessionId?: string | null;
  onSelectSession: (session: AgentSession) => void;
  onOpenRun?: (runId: string) => void;
};

export function SessionListResults({
  sessions,
  loading,
  error,
  selectedSessionId,
  onSelectSession,
  onOpenRun,
}: SessionListResultsProps) {
  return (
    <div className="flex-1 overflow-y-auto p-6">
      {error && (
        <div role="alert" className="mb-4 rounded-md bg-rose-500/10 p-3 text-sm text-rose-500">
          {error}
        </div>
      )}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-text-muted text-sm animate-pulse">
          Loading agent runs...
        </div>
      ) : error ? null : sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-text-muted animate-soft-in">
          <div className="icon-chip icon-chip--slate icon-chip-lg mb-4">
            <QueueListIcon className="w-5 h-5" />
          </div>
          <h3 className="text-text-main font-semibold mb-1">No agent runs yet</h3>
          <p className="text-sm">Ingest agent runs to see trajectories here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sessions.map((session, index) => (
            <SessionCard
              key={session.id}
              session={session}
              index={index}
              isSelected={session.id === selectedSessionId}
              onSelect={() => onSelectSession(session)}
              onOpenRun={onOpenRun}
            />
          ))}
        </div>
      )}
    </div>
  );
}

type SessionCardProps = {
  session: AgentSession;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  onOpenRun?: (runId: string) => void;
};

const SessionCard: React.FC<SessionCardProps> = ({ session, index, isSelected, onSelect, onOpenRun }) => {
  const runCount = session.run_count ?? 0;
  const errorCount = session.error_count ?? 0;
  const lastRunId = session.last_run_id;

  return (
    <Card
      hoverable
      onClick={onSelect}
      className={`relative overflow-hidden transition-all duration-200 animate-soft-in ${isSelected ? 'ring-2 ring-primary shadow-glow' : ''}`}
      style={{ animationDelay: `${index * 30}ms` }}
    >
      <div
        className={`absolute top-0 left-0 right-0 h-1 ${session.status === 'error'
          ? 'bg-rose-500'
          : session.status === 'active'
            ? 'bg-primary'
            : 'bg-emerald-500'}`}
      />
      <div className="pt-3">
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
          <Badge variant={getSessionStatusVariant(session.status)}>{session.status}</Badge>
        </div>

        <p className="text-xs text-text-muted mb-4 font-mono truncate">{session.id}</p>

        <div className="flex items-center flex-wrap gap-x-4 gap-y-2 text-xs mb-4">
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
          {(session.total_cost ?? 0) > 0 && (
            <div className="flex items-center gap-1.5">
              <CurrencyDollarIcon className="w-3.5 h-3.5 text-text-muted" />
              <span className="text-text-main font-medium">${(session.total_cost ?? 0).toFixed(4)}</span>
            </div>
          )}
          {(session.total_latency ?? 0) > 0 && (
            <div className="flex items-center gap-1.5">
              <ClockIcon className="w-3.5 h-3.5 text-text-muted" />
              <span className="text-text-main font-medium">{((session.total_latency ?? 0) / 1000).toFixed(2)}s</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-border-hairline">
          <div className="flex items-center gap-1.5 text-xs text-text-muted">
            <ClockIcon className="w-3.5 h-3.5" />
            <span>{formatSessionTimestamp(session.last_run_at)}</span>
          </div>
          {lastRunId && onOpenRun && (
            <Button
              variant="secondary"
              size="sm"
              onClick={(event) => {
                event.stopPropagation();
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
};
