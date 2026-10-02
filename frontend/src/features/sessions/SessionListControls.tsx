import {
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  PlayCircleIcon,
  QueueListIcon,
} from '@heroicons/react/24/outline';

import { Input, Select } from '../../components/ui';

type SessionListStats = {
  total: number;
  active: number;
  errors: number;
};

type SessionListControlsProps = {
  stats: SessionListStats;
  search: string;
  agentName: string;
  env: string;
  status: string;
  onSearchChange: (value: string) => void;
  onAgentNameChange: (value: string) => void;
  onEnvironmentChange: (value: string) => void;
  onStatusChange: (value: string) => void;
};

export function SessionListControls({
  stats,
  search,
  agentName,
  env,
  status,
  onSearchChange,
  onAgentNameChange,
  onEnvironmentChange,
  onStatusChange,
}: SessionListControlsProps) {
  return (
    <>
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

      <div className="px-6 py-4 flex flex-wrap gap-3 border-b border-border-hairline bg-panel">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search sessions..."
            className="pl-9"
          />
        </div>
        <Input
          value={agentName}
          onChange={(event) => onAgentNameChange(event.target.value)}
          placeholder="Agent name"
          className="w-40"
        />
        <Input
          value={env}
          onChange={(event) => onEnvironmentChange(event.target.value)}
          placeholder="Environment"
          className="w-32"
        />
        <Select value={status} onChange={(event) => onStatusChange(event.target.value)} className="w-36">
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="error">Error</option>
        </Select>
      </div>
    </>
  );
}
