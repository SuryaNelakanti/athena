import { ArrowPathIcon } from '@heroicons/react/24/outline';

import { Badge, Button, Card, IconButton, Input, Select, Textarea } from '../../components/ui';
import { formatTime, NEW_PLAYGROUND_VALUE } from './model';
import type { WorkspaceCardState } from './PlaygroundSidebarState';

export function PlaygroundWorkspaceCard({
  status,
  playgrounds,
  selectedPlaygroundId,
  onSelectPlayground,
  onRefresh,
  name,
  onNameChange,
  description,
  onDescriptionChange,
  isSaving,
  canSave,
  isActive,
  selectedPlayground,
  notice,
  onSave,
  onNew,
  onDelete,
}: WorkspaceCardState) {
  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-text-main">Workspace</h3>
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>
          <p className="text-xs text-text-muted mt-1">
            Save prompts, variants, and parameters as a reusable workspace.
          </p>
        </div>
        <IconButton size="sm" variant="ghost" onClick={onRefresh} aria-label="Refresh playground list">
          <ArrowPathIcon className="w-4 h-4" />
        </IconButton>
      </div>

      <div>
        <label className="text-xs text-text-muted font-semibold uppercase tracking-wide">
          Saved playgrounds
        </label>
        <Select
          className="mt-2"
          value={selectedPlaygroundId}
          onChange={(event) => onSelectPlayground(event.target.value)}
        >
          <option value={NEW_PLAYGROUND_VALUE}>New playground</option>
          {playgrounds.map((playground) => (
            <option key={playground.id} value={playground.id}>{playground.name}</option>
          ))}
        </Select>
      </div>

      <div className="grid gap-3">
        <div>
          <label className="text-xs text-text-muted font-semibold uppercase tracking-wide">Playground name</label>
          <Input
            className="mt-2"
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder="Playground name"
          />
        </div>
        <div>
          <label className="text-xs text-text-muted font-semibold uppercase tracking-wide">Description</label>
          <Textarea
            className="mt-2"
            value={description}
            onChange={(event) => onDescriptionChange(event.target.value)}
            placeholder="Optional context for collaborators"
            rows={3}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="primary" onClick={onSave} disabled={!canSave || isSaving}>
          {isSaving ? 'Saving...' : isActive ? 'Update' : 'Save'}
        </Button>
        <Button size="sm" variant="secondary" onClick={onNew}>New</Button>
        <Button size="sm" variant="danger" onClick={onDelete} disabled={!isActive}>Delete</Button>
      </div>

      {selectedPlayground && (
        <div className="text-xs text-text-muted">Last saved {formatTime(selectedPlayground.updated_at)}</div>
      )}
      {notice && (
        <div className="text-xs text-rose-600 border border-rose-200/40 bg-rose-50/50 rounded-md px-3 py-2">
          {notice}
        </div>
      )}
    </Card>
  );
}
