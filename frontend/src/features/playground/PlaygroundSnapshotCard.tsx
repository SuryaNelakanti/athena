import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';

import { Button, Card, Input, Select } from '../../components/ui';
import type { SnapshotCardState } from './PlaygroundSidebarState';

export function PlaygroundSnapshotCard({
  datasets,
  variants,
  datasetId,
  onDatasetChange,
  variantId,
  onVariantChange,
  name,
  onNameChange,
  hasModelRegistry,
  status,
  error,
  experimentId,
  onSnapshot,
  onOpenExperiment,
}: SnapshotCardState) {
  return (
    <Card className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-text-main">Snapshot to Experiment</h3>
        <p className="text-xs text-text-muted mt-1">
          Convert the current playground into an experiment version.
        </p>
      </div>

      <div className="grid gap-3">
        <div>
          <label className="text-xs text-text-muted font-semibold uppercase tracking-wide">Dataset</label>
          <Select className="mt-2" value={datasetId} onChange={(event) => onDatasetChange(event.target.value)}>
            <option value="">Select dataset</option>
            {datasets.map((dataset) => (
              <option key={dataset.id} value={dataset.id}>{dataset.name}</option>
            ))}
          </Select>
        </div>
        <div>
          <label className="text-xs text-text-muted font-semibold uppercase tracking-wide">Variant</label>
          <Select className="mt-2" value={variantId} onChange={(event) => onVariantChange(event.target.value)}>
            {variants.map((variant) => (
              <option key={variant.id} value={variant.id}>{variant.name} ({variant.model})</option>
            ))}
          </Select>
        </div>
        <div>
          <label className="text-xs text-text-muted font-semibold uppercase tracking-wide">Experiment name</label>
          <Input
            className="mt-2"
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder="Name your experiment"
          />
        </div>
      </div>

      {!hasModelRegistry && (
        <div className="text-xs text-amber-700 border border-amber-200/40 bg-amber-50/40 rounded-md px-3 py-2">
          Model registry is empty. Sync models in Settings before snapshotting.
        </div>
      )}

      <Button
        size="sm"
        variant="primary"
        onClick={onSnapshot}
        disabled={status === 'saving' || !hasModelRegistry || !datasetId || !variantId || !name.trim()}
      >
        {status === 'saving' ? 'Saving...' : 'Snapshot'}
      </Button>

      {error && (
        <div className="text-xs text-rose-600 border border-rose-200/40 bg-rose-50/50 rounded-md px-3 py-2">
          {error}
        </div>
      )}
      {status === 'success' && (
        <div className="text-xs text-emerald-600 border border-emerald-200/40 bg-emerald-50/40 rounded-md px-3 py-2">
          Snapshot created. Ready to run an experiment.
        </div>
      )}
      {experimentId && (
        <Button size="sm" variant="ghost" onClick={onOpenExperiment}>
          Open experiment
          <ArrowTopRightOnSquareIcon className="w-4 h-4" />
        </Button>
      )}
    </Card>
  );
}
