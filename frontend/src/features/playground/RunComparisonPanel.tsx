import { ArrowsRightLeftIcon } from '@heroicons/react/24/outline';
import { Card, cx, Select, Tabs } from '../../components/ui';
import { formatTime } from './model';
import type { DiffChunk, PlaygroundRun } from './model';

type ComparisonMode = 'diff' | 'side';

type RunComparisonPanelProps = {
  runs: PlaygroundRun[];
  leftRun: PlaygroundRun | null;
  rightRun: PlaygroundRun | null;
  leftRunId: string;
  rightRunId: string;
  mode: ComparisonMode;
  diff: DiffChunk[];
  onLeftRunChange: (runId: string) => void;
  onRightRunChange: (runId: string) => void;
  onModeChange: (mode: ComparisonMode) => void;
};

const RunComparisonPanel = ({
  runs,
  leftRun,
  rightRun,
  leftRunId,
  rightRunId,
  mode,
  diff,
  onLeftRunChange,
  onRightRunChange,
  onModeChange,
}: RunComparisonPanelProps) => (
  <Card className='space-y-4'>
    <div className='flex flex-wrap items-center justify-between gap-4'>
      <div>
        <h3 className='text-sm font-semibold text-text-main'>Compare</h3>
        <p className='text-xs text-text-muted mt-1'>
          Diff two runs to see exactly what changed.
        </p>
      </div>
      <Tabs
        value={mode}
        onChange={(value) => onModeChange(value as ComparisonMode)}
        options={[
          { id: 'diff', label: 'Diff' },
          { id: 'side', label: 'Side by side' },
        ]}
      />
    </div>

    <div className='grid grid-cols-1 lg:grid-cols-2 gap-3'>
      <div>
        <label className='text-xs text-text-muted font-semibold uppercase tracking-wide'>
          Left run
        </label>
        <Select
          className='mt-2'
          value={leftRunId}
          onChange={(event) => onLeftRunChange(event.target.value)}
        >
          <option value=''>Select run</option>
          {runs.map((run) => (
            <option key={run.id} value={run.id}>
              {run.variantName} | {run.model} | {formatTime(run.startedAt)}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <label className='text-xs text-text-muted font-semibold uppercase tracking-wide'>
          Right run
        </label>
        <Select
          className='mt-2'
          value={rightRunId}
          onChange={(event) => onRightRunChange(event.target.value)}
        >
          <option value=''>Select run</option>
          {runs.map((run) => (
            <option key={run.id} value={run.id}>
              {run.variantName} | {run.model} | {formatTime(run.startedAt)}
            </option>
          ))}
        </Select>
      </div>
    </div>

    {!leftRun || !rightRun ? (
      <div className='text-xs text-text-muted border border-border-base bg-panel rounded-md p-4'>
        Select two runs to compare output changes.
      </div>
    ) : mode === 'diff' ? (
      <div className='border border-border-base bg-panel rounded-md p-4 text-xs font-mono'>
        {diff.length === 0 ? (
          <div className='text-text-muted'>No differences detected.</div>
        ) : (
          diff.map((chunk, index) => (
            <div
              key={`${chunk.type}-${index}`}
              className={cx(
                'whitespace-pre-wrap leading-relaxed px-2 py-0.5 rounded-sm',
                chunk.type === 'add' && 'bg-emerald-500/10 text-emerald-700',
                chunk.type === 'del' && 'bg-rose-500/10 text-rose-700',
                chunk.type === 'same' && 'text-text-main'
              )}
            >
              <span className='mr-2 text-text-muted'>
                {chunk.type === 'add' ? '+' : chunk.type === 'del' ? '-' : ' '}
              </span>
              {chunk.text || ' '}
            </div>
          ))
        )}
      </div>
    ) : (
      <div className='grid grid-cols-1 lg:grid-cols-2 gap-4'>
        <div className='border border-border-base bg-panel rounded-md p-4 text-xs whitespace-pre-wrap'>
          {leftRun.output || '-'}
        </div>
        <div className='border border-border-base bg-panel rounded-md p-4 text-xs whitespace-pre-wrap'>
          {rightRun.output || '-'}
        </div>
      </div>
    )}

    {leftRun && rightRun && (
      <div className='flex items-center gap-2 text-xs text-text-muted'>
        <ArrowsRightLeftIcon className='w-4 h-4' />
        {leftRun.variantName} vs {rightRun.variantName}
      </div>
    )}
  </Card>
);

export default RunComparisonPanel;
