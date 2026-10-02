import { ArrowDownRightIcon, ArrowUpRightIcon } from '@heroicons/react/24/outline';
import { Badge, Tooltip } from '../../components/ui';
import type { Log } from '../../types';
import type { TraceLineage } from './logTypes';

export type { TraceLineage } from './logTypes';

interface LogResultsTableProps {
  logs: Log[];
  loading: boolean;
  selectedLogId: string | null;
  traceLineage: Record<string, TraceLineage>;
  lineageLoading: boolean;
  onSelectLog: (log: Log) => void;
  onOpenTrace?: (traceId: string) => void;
}

const formatTime = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

const formatDuration = (ms?: number) => {
  if (!ms) return '-';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

const getStatusVariant = (status?: string) => {
  const normalized = status?.toLowerCase();
  if (normalized === 'success') return 'success';
  if (normalized === 'error') return 'danger';
  if (normalized === 'warning') return 'warning';
  return 'neutral';
};

export function LogResultsTable({
  logs,
  loading,
  selectedLogId,
  traceLineage,
  lineageLoading,
  onSelectLog,
  onOpenTrace,
}: LogResultsTableProps) {
  return (
    <>
      <div className="grid grid-cols-12 gap-4 px-5 py-2.5 text-xs font-medium text-text-muted border-b border-border-base">
        <div className="col-span-2">Time</div>
        <div className="col-span-1">Trace ID</div>
        <div className="col-span-5">Message</div>
        <div className="col-span-1 text-right">Latency</div>
        <div className="col-span-1 text-right">Tokens</div>
        <div className="col-span-1 text-right">Cost</div>
        <div className="col-span-1 text-center">Status</div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-8 text-center text-text-muted text-sm italic">Loading logs...</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-text-muted text-sm italic">No logs found matching filters.</div>
        ) : (
          logs.map((log) => {
            const isSelected = selectedLogId === log.id;
            const lineage = log.trace_id ? traceLineage[log.trace_id] : undefined;
            const hasParent = Boolean(lineage?.parent_trace_id);
            const childCount = lineage?.child_count || 0;

            return (
              <div
                key={log.id}
                onClick={() => {
                  onSelectLog(log);
                  if (log.trace_id && onOpenTrace) onOpenTrace(log.trace_id);
                }}
                className={`grid grid-cols-12 gap-4 px-5 py-3 text-sm border-b border-border-hairline cursor-pointer hover:bg-panel-hover transition-colors ${isSelected ? 'bg-primary/5' : ''}`}
              >
                <div className="col-span-2 text-text-muted text-xs flex items-center tabular-nums">
                  {formatTime(log.timestamp)}
                </div>

                <div className="col-span-1 text-text-muted text-xs flex items-center font-mono truncate opacity-75">
                  {log.trace_id ? log.trace_id.slice(0, 8) : '-'}
                </div>

                <div className="col-span-5 flex items-center gap-3 min-w-0">
                  <span className="text-text-main truncate flex-1" title={log.message}>
                    {log.message}
                  </span>
                  {log.event_type && (
                    <Badge variant="neutral" className="text-[10px] flex-shrink-0">
                      {log.event_type}
                    </Badge>
                  )}
                  {(hasParent || childCount > 0 || (lineageLoading && log.trace_id)) && (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {lineageLoading && (
                        <div className="h-4 w-12 rounded-full bg-border-base/50 animate-pulse" />
                      )}
                      {!lineageLoading && hasParent && lineage?.parent_trace_id && (
                        <Tooltip content={`Child of ${lineage.parent_trace_id}`}>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-700 text-[10px] font-semibold uppercase tracking-wide">
                            <ArrowUpRightIcon className="w-3 h-3" />
                            Child
                          </span>
                        </Tooltip>
                      )}
                      {!lineageLoading && childCount > 0 && (
                        <Tooltip content={`Parent of ${childCount} trace${childCount > 1 ? 's' : ''}`}>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-[10px] font-semibold uppercase tracking-wide">
                            <ArrowDownRightIcon className="w-3 h-3" />
                            Parent {childCount}
                          </span>
                        </Tooltip>
                      )}
                    </div>
                  )}
                </div>

                <div className="col-span-1 text-text-muted text-xs flex items-center justify-end tabular-nums">
                  {formatDuration(log.latency_ms)}
                </div>

                <div className="col-span-1 text-text-muted text-xs flex items-center justify-end tabular-nums">
                  {log.total_tokens !== undefined ? log.total_tokens : '-'}
                </div>

                <div className="col-span-1 text-text-muted text-xs flex items-center justify-end tabular-nums">
                  {log.cost !== undefined && log.cost !== null ? `$${log.cost.toFixed(6)}` : '-'}
                </div>

                <div className="col-span-1 flex items-center justify-center">
                  <Badge variant={getStatusVariant(log.status)}>
                    {(log.status || 'ok').toUpperCase()}
                  </Badge>
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
