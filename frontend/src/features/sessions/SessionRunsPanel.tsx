import React from 'react';
import { ArrowTopRightOnSquareIcon, PlayCircleIcon } from '@heroicons/react/24/outline';
import type { AgentRun } from '../../types';
import { Badge, Button, Card } from '../../components/ui';
import { formatSessionDuration, formatSessionRelativeTime, sessionStatusVariant } from './sessionDisplay';

interface SessionRunsPanelProps {
  runs: AgentRun[];
  onOpenRun: (runId: string) => void;
}

const SessionRunsPanel: React.FC<SessionRunsPanelProps> = ({ runs, onOpenRun }) => (
  <Card padded={false} className="animate-soft-in" style={{ animationDelay: '50ms' }}>
    <div className="px-5 py-4 border-b border-border-hairline">
      <div className="flex items-center gap-3">
        <span className="icon-chip icon-chip--sky"><PlayCircleIcon className="w-4 h-4" /></span>
        <div>
          <h3 className="text-sm font-semibold text-text-main">Runs</h3>
          <p className="text-xs text-text-muted">Latest runs in this session</p>
        </div>
      </div>
    </div>
    <div className="divide-y divide-border-hairline">
      {runs.length === 0 ? (
        <div className="px-6 py-8 text-center text-sm text-text-muted">
          <PlayCircleIcon className="w-8 h-8 mx-auto mb-2 opacity-40" />
          No runs yet
        </div>
      ) : runs.map((run) => (
        <div
          key={run.id}
          className="px-5 py-4 flex items-center gap-4 hover:bg-panel-hover transition-colors cursor-pointer group"
          onClick={() => onOpenRun(run.id)}
        >
          <div className={`w-2 h-2 rounded-full shrink-0 ${run.status === 'error'
            ? 'bg-rose-500'
            : run.status === 'active'
              ? 'bg-primary animate-pulse'
              : 'bg-emerald-500'
            }`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono font-medium text-text-main truncate">{run.id}</span>
              <Badge variant={sessionStatusVariant(run.status)} className="shrink-0">{run.status}</Badge>
            </div>
            <div className="text-xs text-text-muted mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>{formatSessionRelativeTime(run.started_at)}</span>
              <span>•</span>
              <span>{formatSessionDuration(run.started_at, run.ended_at)}</span>
              {run.trace_id && (
                <>
                  <span>•</span>
                  <span className="font-mono text-[10px]">Trace: {run.trace_id.slice(0, 8)}...</span>
                </>
              )}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-sm text-text-main font-medium">{run.total_tokens?.toLocaleString() ?? '--'} tokens</div>
            <div className="text-xs text-text-muted">${run.total_cost?.toFixed(4) ?? '--'}</div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              onOpenRun(run.id);
            }}
            className="opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <ArrowTopRightOnSquareIcon className="w-4 h-4" />
            View
          </Button>
        </div>
      ))}
    </div>
  </Card>
);

export default SessionRunsPanel;
