import { Badge, Button, Card } from '../../components/ui';
import { formatDuration, formatShortId, formatTime, runStatusVariant } from './model';
import type { RunBoardCardState } from './PlaygroundSidebarState';

export function PlaygroundRunBoardCard({
  variants,
  latestRunByVariant,
  runningCount,
  runs,
  lastRun,
  onClear,
}: RunBoardCardState) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-text-main">Run board</h3>
          <p className="text-xs text-text-muted mt-1">Keep track of outputs as you iterate.</p>
        </div>
        <Badge variant={runningCount > 0 ? 'primary' : 'neutral'}>
          {runningCount > 0 ? 'Running' : 'Idle'}
        </Badge>
      </div>

      <div className="space-y-2">
        {variants.map((variant) => {
          const run = latestRunByVariant.get(variant.id);
          const status = run?.status || 'idle';
          return (
            <div key={variant.id} className="flex items-center justify-between text-xs">
              <div className="flex flex-col">
                <span className="text-text-main font-semibold">{variant.name}</span>
                <span className="text-[10px] text-text-muted">{variant.model}</span>
              </div>
              <Badge variant={runStatusVariant(status)}>
                {status === 'idle'
                  ? 'Idle'
                  : status === 'running'
                    ? 'Streaming'
                    : status === 'success'
                      ? 'Complete'
                      : status === 'canceled'
                        ? 'Canceled'
                        : 'Error'}
              </Badge>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs text-text-muted">
        <div>
          <div className="uppercase tracking-wide font-semibold text-[10px]">Runs</div>
          <div className="text-text-main font-semibold text-sm">{runs.length}</div>
        </div>
        <div>
          <div className="uppercase tracking-wide font-semibold text-[10px]">Last run</div>
          <div className="text-text-main font-semibold text-sm">{formatTime(lastRun?.startedAt)}</div>
        </div>
        <div>
          <div className="uppercase tracking-wide font-semibold text-[10px]">Duration</div>
          <div className="text-text-main font-semibold text-sm">
            {lastRun ? formatDuration(lastRun.startedAt, lastRun.completedAt) : '-'}
          </div>
        </div>
        <div>
          <div className="uppercase tracking-wide font-semibold text-[10px]">Trace</div>
          <div className="text-text-main font-semibold text-sm">{formatShortId(lastRun?.traceId)}</div>
        </div>
      </div>

      <Button size="sm" variant="ghost" onClick={onClear} disabled={!runs.length}>
        Clear run history
      </Button>
    </Card>
  );
}
