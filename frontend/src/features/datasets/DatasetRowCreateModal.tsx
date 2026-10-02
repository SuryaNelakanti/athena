import { Button, Modal, Tabs, Textarea } from '../../components/ui';
import type { DatasetExampleType, DatasetRowDraft } from './useDatasetRowCreation';

const EXAMPLE_TABS = [
  { id: 'gold', label: 'Gold Example' },
  { id: 'anti_pattern', label: 'Anti-Pattern' },
];

type DatasetRowCreateModalProps = {
  open: boolean;
  isEvalTab: boolean;
  isResourceTab: boolean;
  draft: DatasetRowDraft;
  error: string | null;
  onDraftChange: (patch: Partial<DatasetRowDraft>) => void;
  onClose: () => void;
  onSubmit: () => void | Promise<void>;
};

export function DatasetRowCreateModal({
  open,
  isEvalTab,
  isResourceTab,
  draft,
  error,
  onDraftChange,
  onClose,
  onSubmit,
}: DatasetRowCreateModalProps) {
  const exampleType: DatasetExampleType = draft.example_type;

  return (
    <Modal
      open={open}
      title={isResourceTab ? 'Add Resource' : 'Add Eval Row'}
      description={isResourceTab
        ? 'Store reference material for context.'
        : 'Create an input-output pair for testing.'}
      onClose={onClose}
      footer={(
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            variant={isEvalTab ? (exampleType === 'gold' ? 'success' : 'danger') : 'primary'}
            size="sm"
            onClick={onSubmit}
          >
            {isEvalTab
              ? (exampleType === 'gold' ? 'Add Gold Example' : 'Add Anti-Pattern')
              : 'Add Resource'}
          </Button>
        </div>
      )}
      className="max-w-xl"
    >
      <div className="space-y-4">
        {error && (
          <div className="text-xs text-rose-500 font-semibold bg-rose-500/10 rounded-md p-3">
            {error}
          </div>
        )}

        {isEvalTab && (
          <div>
            <label className="block text-[11px] font-medium text-text-muted mb-2">Example Type</label>
            <Tabs
              options={EXAMPLE_TABS}
              value={exampleType}
              onChange={(value) => onDraftChange({ example_type: value as DatasetExampleType })}
            />
            <p className="text-[11px] text-text-muted mt-2">
              {exampleType === 'gold'
                ? 'Gold entries show correct AI behavior.'
                : 'Anti-patterns show outputs the AI should avoid.'}
            </p>
          </div>
        )}

        <div>
          <label className="block text-[11px] font-medium text-text-muted mb-2">
            {isResourceTab ? 'Resource Content' : 'Input (Prompt / Question)'}
          </label>
          <Textarea
            value={draft.input}
            onChange={(event) => onDraftChange({ input: event.target.value })}
            className="h-28 resize-none"
            placeholder={isResourceTab
              ? 'Paste the reference content or notes here.'
              : 'What question or prompt should be given to the AI?'}
          />
        </div>

        {isEvalTab && (
          <div>
            <label className="block text-[11px] font-medium text-text-muted mb-2">
              {exampleType === 'gold'
                ? 'Expected Output (Correct Answer)'
                : 'Anti-Pattern Output (What to Avoid)'}
            </label>
            <Textarea
              value={draft.expected}
              onChange={(event) => onDraftChange({ expected: event.target.value })}
              className={`h-28 resize-none ${exampleType === 'gold'
                ? 'bg-emerald-500/5 border-emerald-500/30 focus:ring-emerald-500/20 focus:border-emerald-500/50'
                : 'bg-rose-500/5 border-rose-500/30 focus:ring-rose-500/20 focus:border-rose-500/50'}`}
              placeholder={exampleType === 'gold'
                ? "What's the correct response?"
                : 'What output should the AI avoid?'}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
