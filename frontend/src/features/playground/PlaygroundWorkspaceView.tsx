import type { ComponentProps } from 'react';
import { PlayIcon, StopIcon } from '@heroicons/react/24/outline';

import { Button } from '../../components/ui';
import { PageHeader } from '../../layouts/PageHeader';
import TraceDetail from '../../pages/TraceDetail';
import RunComparisonPanel from './RunComparisonPanel';
import { PlaygroundPromptCard } from './PlaygroundPromptCard';
import type { PlaygroundPromptCardProps } from './PlaygroundPromptCard';
import { PlaygroundSidebar } from './PlaygroundSidebar';
import type { PlaygroundSidebarProps } from './PlaygroundSidebarState';
import { PlaygroundTraceModal } from './PlaygroundTraceModal';
import { PlaygroundVariantGrid } from './PlaygroundVariantGrid';
import type { PlaygroundVariantGridProps } from './PlaygroundVariantGrid';

type PlaygroundWorkspaceViewProps = {
  projectId: string;
  batchRunning: boolean;
  runningCount: number;
  onRunAll: () => void;
  onStopAll: () => void;
  workspaceDataError: string | null;
  workspaceDataLoading: boolean;
  onRetryWorkspace: () => void;
  sidebar: PlaygroundSidebarProps;
  prompt: PlaygroundPromptCardProps;
  variantGrid: PlaygroundVariantGridProps;
  comparison: ComponentProps<typeof RunComparisonPanel>;
  trace: {
    open: boolean;
    loading: boolean;
    error: string | null;
    activeTrace: ComponentProps<typeof TraceDetail>['trace'] | null;
    onClose: () => void;
  };
};

export function PlaygroundWorkspaceView({
  projectId,
  batchRunning,
  runningCount,
  onRunAll,
  onStopAll,
  workspaceDataError,
  workspaceDataLoading,
  onRetryWorkspace,
  sidebar,
  prompt,
  variantGrid,
  comparison,
  trace,
}: PlaygroundWorkspaceViewProps) {
  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Playgrounds"
        subtitle="Iterate on prompts, models, and parameters with live traces and fast comparisons."
        actions={(
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={onRunAll}
              disabled={!variantGrid.variants.length || batchRunning || !projectId}
            >
              <PlayIcon className="w-4 h-4" />
              Run all
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onStopAll}
              disabled={runningCount === 0}
            >
              <StopIcon className="w-4 h-4" />
              Stop all
            </Button>
          </div>
        )}
      />

      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 xl:grid-cols-[320px,1fr] gap-6 px-6 py-6">
          {workspaceDataError && (
            <div role="alert" className="xl:col-span-2 flex items-center justify-between gap-3 rounded-lg border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-sm text-rose-500">
              <span>{workspaceDataError}</span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void onRetryWorkspace()}
                disabled={workspaceDataLoading}
              >
                {workspaceDataLoading ? 'Retrying...' : 'Retry'}
              </Button>
            </div>
          )}
          <PlaygroundSidebar {...sidebar} />
          <main className="space-y-6">
            <PlaygroundPromptCard {...prompt} />
            <PlaygroundVariantGrid {...variantGrid} />
            <RunComparisonPanel {...comparison} />
          </main>
        </div>
      </div>

      <PlaygroundTraceModal
        open={trace.open}
        loading={trace.loading}
        error={trace.error}
        onClose={trace.onClose}
      >
        {trace.activeTrace && <TraceDetail trace={trace.activeTrace} onClose={trace.onClose} />}
      </PlaygroundTraceModal>
    </div>
  );
}
