import React, { useMemo } from 'react';
import { ClockIcon, CurrencyDollarIcon, ExclamationTriangleIcon, PlayCircleIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import type { AgentRun, AgentSession } from '../../types';

interface SessionOverviewProps {
  session: Pick<AgentSession, 'run_count' | 'error_count'>;
  runs: AgentRun[];
}

const toneClasses = {
  sky: 'icon-chip--sky',
  rose: 'icon-chip--rose',
  indigo: 'icon-chip--indigo',
  amber: 'icon-chip--amber',
  slate: 'icon-chip--slate',
} as const;

const SessionOverview: React.FC<SessionOverviewProps> = ({ session, runs }) => {
  const runCount = session.run_count ?? runs.length;
  const errorCount = session.error_count ?? runs.filter((run) => run.status === 'error').length;
  const stats = useMemo(() => {
    const totalTokens = runs.reduce((total, run) => total + (run.total_tokens || 0), 0);
    const totalCost = runs.reduce((total, run) => total + (run.total_cost || 0), 0);
    const avgLatency = runs.length
      ? runs.reduce((total, run) => total + (run.total_latency || 0), 0) / runs.length
      : 0;
    return { totalTokens, totalCost, avgLatency };
  }, [runs]);

  return (
    <div className="px-6 py-4 flex flex-wrap items-center gap-6 border-b border-border-hairline bg-panel">
      <OverviewMetric icon={<PlayCircleIcon className="w-4 h-4" />} tone="sky" value={runCount} label="Runs" />
      <Divider />
      <OverviewMetric
        icon={<ExclamationTriangleIcon className="w-4 h-4" />}
        tone="rose"
        value={errorCount}
        label="Errors"
        highlight={errorCount > 0}
      />
      <Divider />
      <OverviewMetric icon={<DocumentTextIcon className="w-4 h-4" />} tone="indigo" value={stats.totalTokens.toLocaleString()} label="Tokens" />
      <Divider />
      <OverviewMetric icon={<CurrencyDollarIcon className="w-4 h-4" />} tone="amber" value={`$${stats.totalCost.toFixed(4)}`} label="Cost" />
      <Divider />
      <OverviewMetric icon={<ClockIcon className="w-4 h-4" />} tone="slate" value={`${stats.avgLatency.toFixed(0)}ms`} label="Avg Latency" />
    </div>
  );
};

const OverviewMetric: React.FC<{
  icon: React.ReactNode;
  tone: 'sky' | 'rose' | 'indigo' | 'amber' | 'slate';
  value: React.ReactNode;
  label: string;
  highlight?: boolean;
}> = ({ icon, tone, value, label, highlight = false }) => (
  <div className="flex items-center gap-2">
    <span className={`icon-chip ${toneClasses[tone]}`}>{icon}</span>
    <div>
      <div className={`text-lg font-bold ${highlight ? 'text-rose-500' : 'text-text-main'}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold">{label}</div>
    </div>
  </div>
);

const Divider: React.FC = () => <div className="w-px h-8 bg-border-hairline" />;

export default SessionOverview;
