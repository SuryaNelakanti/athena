import { BookOpenIcon, ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { Badge, Button, Input, Select, Textarea } from '../../components/ui';

export type OwlActionId = 'aql' | 'prompt' | 'scorer' | 'dataset' | 'experiment' | 'docs';

const OWL_ACTIONS: Array<{ id: OwlActionId; title: string; description: string }> = [
  { id: 'aql', title: 'AQL Author', description: 'Describe the question and get a ready-to-run AQL query.' },
  { id: 'prompt', title: 'Prompt Optimizer', description: 'Refine prompts for tone, safety, and clarity.' },
  { id: 'scorer', title: 'Scorer Draft', description: 'Create a criteria-based scorer checklist.' },
  { id: 'dataset', title: 'Dataset Ideas', description: 'Generate dataset rows for new evaluation coverage.' },
  { id: 'experiment', title: 'Experiment Summary', description: 'Summarize the latest experiment run and next steps.' },
  { id: 'docs', title: 'Docs Search', description: 'Find exact snippets in Athena docs.' },
];

type OwlPlaybookPanelProps = {
  activeAction: OwlActionId;
  actionInputs: Record<string, string>;
  experimentOptions: Array<{ value: string; label: string }>;
  experimentsLoading: boolean;
  experimentsError: string | null;
  actionError: string | null;
  loading: boolean;
  isExpanded: boolean;
  onActionChange: (action: OwlActionId) => void;
  onInputChange: (key: string, value: string) => void;
  onToggle: () => void;
  onRetryExperiments: () => void;
  onRun: () => void;
};

export const OwlPlaybookPanel = ({
  activeAction,
  actionInputs,
  experimentOptions,
  experimentsLoading,
  experimentsError,
  actionError,
  loading,
  isExpanded,
  onActionChange,
  onInputChange,
  onToggle,
  onRetryExperiments,
  onRun,
}: OwlPlaybookPanelProps) => {
  const activeActionDetails = OWL_ACTIONS.find((action) => action.id === activeAction);

  return (
    <div className="border-b border-border-base">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2 hover:bg-panel-hover transition-colors"
      >
        <div className="flex items-center gap-2">
          <BookOpenIcon className="w-3.5 h-3.5 text-text-muted" />
          <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">Playbooks</span>
          <Badge variant="neutral" className="text-[9px]">{activeAction}</Badge>
        </div>
        {isExpanded ? (
          <ChevronDownIcon className="w-3.5 h-3.5 text-text-muted" />
        ) : (
          <ChevronRightIcon className="w-3.5 h-3.5 text-text-muted" />
        )}
      </button>

      {isExpanded && (
        <div className="px-4 pb-3 space-y-2 animate-soft-in">
          <Select
            value={activeAction}
            onChange={(event) => onActionChange(event.target.value as OwlActionId)}
            className="text-xs"
          >
            {OWL_ACTIONS.map((action) => (
              <option key={action.id} value={action.id}>{action.title}</option>
            ))}
          </Select>
          <div className="text-[10px] text-text-muted">{activeActionDetails?.description}</div>

          {activeAction === 'aql' && (
            <Textarea
              value={actionInputs.question || ''}
              onChange={(event) => onInputChange('question', event.target.value)}
              placeholder="What do you want to learn from logs?"
              className="text-xs h-16 resize-none"
            />
          )}
          {activeAction === 'prompt' && (
            <div className="space-y-2">
              <Textarea
                value={actionInputs.prompt || ''}
                onChange={(event) => onInputChange('prompt', event.target.value)}
                placeholder="Paste the prompt to improve"
                className="text-xs h-16 resize-none"
              />
              <Input
                value={actionInputs.goal || ''}
                onChange={(event) => onInputChange('goal', event.target.value)}
                placeholder="Goal (optional)"
                className="text-xs"
              />
            </div>
          )}
          {activeAction === 'scorer' && (
            <Textarea
              value={actionInputs.criteria || ''}
              onChange={(event) => onInputChange('criteria', event.target.value)}
              placeholder="List the criteria the scorer should enforce"
              className="text-xs h-16 resize-none"
            />
          )}
          {activeAction === 'dataset' && (
            <Textarea
              value={actionInputs.domain || ''}
              onChange={(event) => onInputChange('domain', event.target.value)}
              placeholder="Describe the dataset focus (scenario, product area, policy)"
              className="text-xs h-16 resize-none"
            />
          )}
          {activeAction === 'experiment' && (
            <div className="space-y-1.5">
              <Select
                value={actionInputs.experiment_id || ''}
                onChange={(event) => onInputChange('experiment_id', event.target.value)}
                className="text-xs"
                disabled={experimentsLoading || Boolean(experimentsError)}
              >
                <option value="">{experimentsLoading ? 'Loading experiments...' : 'Select experiment'}</option>
                {experimentOptions.map((experiment) => (
                  <option key={experiment.value} value={experiment.value}>{experiment.label}</option>
                ))}
              </Select>
              {experimentsError && (
                <div role="alert" className="flex items-center justify-between gap-2 text-[10px] text-rose-500">
                  <span>{experimentsError}</span>
                  <Button variant="secondary" size="sm" onClick={onRetryExperiments}>Retry</Button>
                </div>
              )}
            </div>
          )}
          {activeAction === 'docs' && (
            <Input
              value={actionInputs.docs_query || ''}
              onChange={(event) => onInputChange('docs_query', event.target.value)}
              placeholder="Search docs for..."
              className="text-xs"
            />
          )}

          {actionError && (
            <div className="text-[10px] text-rose-500 font-medium bg-rose-500/10 rounded-md px-2 py-1">
              {actionError}
            </div>
          )}
          <Button variant="primary" size="sm" onClick={onRun} disabled={loading} className="w-full">
            {loading ? 'Working...' : 'Run playbook'}
          </Button>
        </div>
      )}
    </div>
  );
};
