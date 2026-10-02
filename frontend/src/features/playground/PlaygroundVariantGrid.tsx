import { PlayIcon, PlusIcon, StopIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { Badge, Button, Card, IconButton, Input, Select } from '../../components/ui';
import {
  formatDuration,
  formatShortId,
  formatTime,
  getProviderLabel,
  runStatusVariant,
} from './model';
import type { ModelOption, PlaygroundRun, PlaygroundVariant } from './model';

export interface PlaygroundVariantActions {
  onAddVariant: () => void;
  onUpdateVariant: (variantId: string, patch: Partial<PlaygroundVariant>) => void;
  onRemoveVariant: (variantId: string) => void;
  onRunVariant: (variant: PlaygroundVariant) => void;
  onStopRun: (runId: string) => void;
  onUseOutput: (run?: PlaygroundRun) => void;
  onAddToContext: (run?: PlaygroundRun) => void;
  onCopyOutput: (run?: PlaygroundRun) => void | Promise<void>;
  onOpenTrace: (traceId?: string) => void | Promise<void>;
  onSelectCompareLeft: (runId: string) => void;
  onSelectCompareRight: (runId: string) => void;
}

export interface PlaygroundVariantGridProps {
  variants: PlaygroundVariant[];
  modelOptions: ModelOption[];
  latestRunByVariant: ReadonlyMap<string, PlaygroundRun>;
  compareLeftId: string;
  compareRightId: string;
  actions: PlaygroundVariantActions;
}

interface PlaygroundVariantCardProps {
  variant: PlaygroundVariant;
  run?: PlaygroundRun;
  modelOptions: ModelOption[];
  canRemove: boolean;
  compareLeftId: string;
  compareRightId: string;
  actions: PlaygroundVariantActions;
}

const runStatusLabel = (status: PlaygroundRun['status'] | 'idle') => {
  if (status === 'idle') return 'Idle';
  if (status === 'running') return 'Streaming';
  if (status === 'success') return 'Complete';
  if (status === 'canceled') return 'Canceled';
  return 'Error';
};

const PlaygroundVariantCard = ({
  variant,
  run,
  modelOptions,
  canRemove,
  compareLeftId,
  compareRightId,
  actions,
}: PlaygroundVariantCardProps) => {
  const status = run?.status || 'idle';

  return (
    <div className='rounded-lg border border-border-base bg-app p-4 space-y-4'>
      <div className='flex items-start justify-between gap-3'>
        <div className='flex-1 space-y-2'>
          <Input
            value={variant.name}
            onChange={(event) => actions.onUpdateVariant(variant.id, { name: event.target.value })}
            className='text-sm font-semibold'
          />
          <Badge variant={runStatusVariant(status)}>{runStatusLabel(status)}</Badge>
        </div>
        <div className='flex items-center gap-2'>
          {status === 'running' ? (
            <Button size='sm' variant='ghost' onClick={() => run && actions.onStopRun(run.id)}>
              <StopIcon className='w-4 h-4' />
              Stop
            </Button>
          ) : (
            <Button size='sm' variant='primary' onClick={() => actions.onRunVariant(variant)}>
              <PlayIcon className='w-4 h-4' />
              Run
            </Button>
          )}
          <IconButton
            size='sm'
            variant='ghost'
            onClick={() => actions.onRemoveVariant(variant.id)}
            disabled={!canRemove}
            aria-label='Remove variant'
          >
            <XMarkIcon className='w-4 h-4' />
          </IconButton>
        </div>
      </div>

      <div className='grid gap-3'>
        <div>
          <label className='text-xs text-text-muted font-semibold uppercase tracking-wide'>Model</label>
          <Select
            className='mt-2'
            value={variant.model}
            onChange={(event) => {
              const model = event.target.value;
              const match = modelOptions.find((option) => option.id === model);
              actions.onUpdateVariant(variant.id, { model, provider: match?.provider });
            }}
          >
            {modelOptions.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </Select>
        </div>
        <div className='flex items-center justify-between text-xs text-text-muted'>
          <span>Provider</span>
          <Badge variant='neutral'>{getProviderLabel(variant.provider)}</Badge>
        </div>
      </div>

      <div className='grid grid-cols-3 gap-3'>
        <div>
          <label className='text-[10px] text-text-muted uppercase tracking-wide font-semibold'>
            Temperature
          </label>
          <Input
            className='mt-2'
            type='number'
            step='0.1'
            min='0'
            max='2'
            value={variant.temperature}
            onChange={(event) =>
              actions.onUpdateVariant(variant.id, {
                temperature: Number(event.target.value || 0),
              })
            }
          />
        </div>
        <div>
          <label className='text-[10px] text-text-muted uppercase tracking-wide font-semibold'>Top P</label>
          <Input
            className='mt-2'
            type='number'
            step='0.1'
            min='0'
            max='1'
            value={variant.top_p}
            onChange={(event) =>
              actions.onUpdateVariant(variant.id, { top_p: Number(event.target.value || 0) })
            }
          />
        </div>
        <div>
          <label className='text-[10px] text-text-muted uppercase tracking-wide font-semibold'>
            Max tokens
          </label>
          <Input
            className='mt-2'
            type='number'
            min='1'
            value={variant.max_tokens ?? ''}
            onChange={(event) =>
              actions.onUpdateVariant(variant.id, {
                max_tokens: event.target.value ? Number(event.target.value) : null,
              })
            }
          />
        </div>
      </div>

      <div className='space-y-3'>
        <div className='flex items-center justify-between'>
          <div className='text-xs text-text-muted font-semibold uppercase tracking-wide'>Output</div>
          {run && (
            <div className='flex items-center gap-3 text-xs text-text-muted'>
              <span>{formatTime(run.completedAt || run.startedAt)}</span>
              <span>{formatDuration(run.startedAt, run.completedAt)}</span>
            </div>
          )}
        </div>
        <div className='border border-border-base bg-panel rounded-md p-3 text-xs text-text-main whitespace-pre-wrap min-h-[90px] max-h-60 overflow-y-auto pr-2'>
          {run?.output || 'No output yet.'}
        </div>
        <div className='flex flex-wrap items-center gap-2 text-xs'>
          <Button size='sm' variant='ghost' onClick={() => actions.onUseOutput(run)} disabled={!run?.output}>
            Use as input
          </Button>
          <Button size='sm' variant='ghost' onClick={() => actions.onAddToContext(run)} disabled={!run?.output}>
            Add to context
          </Button>
          <Button size='sm' variant='ghost' onClick={() => actions.onCopyOutput(run)} disabled={!run?.output}>
            Copy output
          </Button>
        </div>

        {run?.reasoning && (
          <div className='border border-amber-200/40 bg-amber-50/40 rounded-md p-3 text-xs text-amber-800 whitespace-pre-wrap max-h-48 overflow-y-auto pr-2'>
            <div className='text-[10px] uppercase tracking-wide font-semibold mb-2'>Reasoning</div>
            {run.reasoning}
          </div>
        )}

        {run?.error && (
          <div className='border border-rose-200/40 bg-rose-50/40 rounded-md p-3 text-xs text-rose-700 whitespace-pre-wrap'>
            {run.error}
          </div>
        )}
      </div>

      <div className='flex flex-wrap items-center justify-between gap-2 text-xs'>
        <div className='flex items-center gap-2 text-text-muted'>
          <span>Trace</span>
          <span className='text-text-main font-medium'>{formatShortId(run?.traceId)}</span>
        </div>
        <div className='flex items-center gap-2'>
          <Button
            size='sm'
            variant={compareLeftId === run?.id ? 'primary' : 'outline'}
            onClick={() => run && actions.onSelectCompareLeft(run.id)}
            disabled={!run}
          >
            Left
          </Button>
          <Button
            size='sm'
            variant={compareRightId === run?.id ? 'primary' : 'outline'}
            onClick={() => run && actions.onSelectCompareRight(run.id)}
            disabled={!run}
          >
            Right
          </Button>
          <Button
            size='sm'
            variant='ghost'
            onClick={() => actions.onOpenTrace(run?.traceId)}
            disabled={!run?.traceId}
          >
            Trace
          </Button>
        </div>
      </div>
    </div>
  );
};

export const PlaygroundVariantGrid = ({
  variants,
  modelOptions,
  latestRunByVariant,
  compareLeftId,
  compareRightId,
  actions,
}: PlaygroundVariantGridProps) => (
  <Card className='space-y-4'>
    <div className='flex items-start justify-between gap-4'>
      <div>
        <h3 className='text-sm font-semibold text-text-main'>Variants</h3>
        <p className='text-xs text-text-muted mt-1'>
          Compare models side by side with their own parameters.
        </p>
      </div>
      <div className='flex items-center gap-2'>
        <Button size='sm' variant='secondary' onClick={actions.onAddVariant}>
          <PlusIcon className='w-4 h-4' />
          Add variant
        </Button>
      </div>
    </div>

    <div className='grid grid-cols-1 xl:grid-cols-2 gap-4'>
      {variants.map((variant) => (
        <div key={variant.id} className='min-w-0'>
          <PlaygroundVariantCard
            variant={variant}
            run={latestRunByVariant.get(variant.id)}
            modelOptions={modelOptions}
            canRemove={variants.length > 1}
            compareLeftId={compareLeftId}
            compareRightId={compareRightId}
            actions={actions}
          />
        </div>
      ))}
    </div>
  </Card>
);
