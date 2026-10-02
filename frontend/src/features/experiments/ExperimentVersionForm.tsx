import { Button, Input, Modal, Select, Textarea } from '../../components/ui';
import type { Function, ModelRegistry } from '../../types';
import type { ExperimentVersionDraft } from './versionDraft';

interface ExperimentVersionFormProps {
  open: boolean;
  models: ModelRegistry[];
  scorers: Function[];
  draft: ExperimentVersionDraft;
  onDraftChange: (changes: Partial<ExperimentVersionDraft>) => void;
  onToggleScorer: (scorerType: string) => void;
  onSetPrimaryScorer: (scorerType: string) => void;
  onUpdateScorerConfig: (scorerType: string, field: 'weight' | 'threshold', value: string) => void;
  onClose: () => void;
  onCreate: () => void;
}

export function ExperimentVersionForm({
  open,
  models,
  scorers,
  draft,
  onDraftChange,
  onToggleScorer,
  onSetPrimaryScorer,
  onUpdateScorerConfig,
  onClose,
  onCreate,
}: ExperimentVersionFormProps) {
  return (
    <Modal
      open={open}
      title="New Version"
      description="Create a new version with prompt and scorer configuration."
      onClose={onClose}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={onCreate}>
            Create
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-[11px] font-medium text-text-muted mb-2">Model</label>
          <Select
            value={draft.model_registry_id}
            onChange={(event) => onDraftChange({ model_registry_id: event.target.value })}
          >
            {models.map((model) => (
              <option key={model.id} value={model.id}>{model.display_name || model.model_id}</option>
            ))}
          </Select>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-text-muted mb-2">System prompt</label>
          <Textarea
            value={draft.system_prompt}
            onChange={(event) => onDraftChange({ system_prompt: event.target.value })}
            rows={4}
            placeholder="You are a helpful assistant..."
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-text-muted mb-2">Prompt template</label>
          <Textarea
            value={draft.prompt_template}
            onChange={(event) => onDraftChange({ prompt_template: event.target.value })}
            rows={3}
            placeholder="Answer the following: {{input}}"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-medium text-text-muted mb-2">Temperature</label>
            <Input
              type="number"
              value={draft.temperature}
              onChange={(event) => onDraftChange({ temperature: Number(event.target.value) })}
              step="0.1"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-text-muted mb-2">Max tokens</label>
            <Input
              type="number"
              value={draft.max_tokens}
              onChange={(event) => onDraftChange({ max_tokens: event.target.value })}
            />
          </div>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-text-muted mb-2">Scorers</label>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {scorers.map((scorer) => {
                const isSelected = draft.scorers.some((selected) => selected.type === scorer.name);
                return (
                  <button
                    type="button"
                    key={scorer.name}
                    onClick={() => onToggleScorer(scorer.name)}
                    className={`px-3 py-1 rounded-full border text-xs ${isSelected ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border-base text-text-muted'}`}
                  >
                    {scorer.display_name || scorer.name}
                  </button>
                );
              })}
            </div>
            {draft.scorers.length > 0 && (
              <div className="space-y-2">
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-text-muted mb-1">Primary scorer</label>
                  <Select
                    value={draft.scorers.find((scorer) => scorer.is_primary)?.type || draft.scorers[0].type}
                    onChange={(event) => onSetPrimaryScorer(event.target.value)}
                  >
                    {draft.scorers.map((scorer) => (
                      <option key={scorer.type} value={scorer.type}>{scorer.type}</option>
                    ))}
                  </Select>
                </div>
                {draft.scorers.map((scorer) => (
                  <div key={scorer.type} className="grid grid-cols-3 gap-2 items-center">
                    <div className="text-xs text-text-main">{scorer.type}</div>
                    <Input
                      type="number"
                      step="0.1"
                      value={scorer.weight ?? 1.0}
                      onChange={(event) => onUpdateScorerConfig(scorer.type, 'weight', event.target.value)}
                      placeholder="Weight"
                    />
                    <Input
                      type="number"
                      step="0.05"
                      value={scorer.threshold ?? 0.8}
                      onChange={(event) => onUpdateScorerConfig(scorer.type, 'threshold', event.target.value)}
                      placeholder="Threshold"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-text-muted mb-2">Notes</label>
          <Textarea
            value={draft.notes}
            onChange={(event) => onDraftChange({ notes: event.target.value })}
            rows={2}
            placeholder="Why this change?"
          />
        </div>
      </div>
    </Modal>
  );
}
