import { Button, Input, Modal, Select, Textarea } from '../../components/ui';
import type { FunctionDraft } from './useFunctionCatalog';

type FunctionCreateModalProps = {
  open: boolean;
  draft: FunctionDraft;
  criteria: string;
  error: string | null;
  onDraftChange: (patch: Partial<FunctionDraft>) => void;
  onCriteriaChange: (criteria: string) => void;
  onClose: () => void;
  onCreate: () => void;
};

export function FunctionCreateModal({
  open,
  draft,
  criteria,
  error,
  onDraftChange,
  onCriteriaChange,
  onClose,
  onCreate,
}: FunctionCreateModalProps) {
  return (
    <Modal
      open={open}
      title="New Function"
      description="Create a custom scorer or tool function."
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
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-medium text-text-muted mb-2">Name</label>
            <Input
              autoFocus
              placeholder="e.g. policy_compliance"
              value={draft.name}
              onChange={(event) => onDraftChange({ name: event.target.value })}
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-text-muted mb-2">Display Name</label>
            <Input
              placeholder="e.g. Policy Compliance"
              value={draft.display_name}
              onChange={(event) => onDraftChange({ display_name: event.target.value })}
            />
          </div>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-text-muted mb-2">Description</label>
          <Textarea
            className="h-16 resize-none"
            placeholder="What does this function do?"
            value={draft.description}
            onChange={(event) => onDraftChange({ description: event.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-medium text-text-muted mb-2">Type</label>
            <Select
              value={draft.type}
              onChange={(event) => onDraftChange({ type: event.target.value as FunctionDraft['type'] })}
            >
              <option value="scorer">Scorer</option>
              <option value="tool">Tool</option>
            </Select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-text-muted mb-2">Runtime</label>
            <Select
              value={draft.runtime}
              onChange={(event) => onDraftChange({ runtime: event.target.value as FunctionDraft['runtime'] })}
            >
              <option value="llm_judge">LLM Judge</option>
              <option value="python">Python</option>
              <option value="builtin">Built-in</option>
            </Select>
          </div>
        </div>
        {draft.runtime === 'llm_judge' && (
          <div>
            <label className="block text-[11px] font-medium text-text-muted mb-2">
              Evaluation Criteria
            </label>
            <Textarea
              className="h-24 resize-none font-mono text-xs"
              placeholder="Rate the response on accuracy, helpfulness, and policy compliance. Return a score from 0-1."
              value={criteria}
              onChange={(event) => onCriteriaChange(event.target.value)}
            />
          </div>
        )}
        {error && <p className="text-xs text-rose-500 font-medium">{error}</p>}
      </div>
    </Modal>
  );
}
