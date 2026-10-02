import type { Dataset, Playground } from '../../types';
import type { PlaygroundRun, PlaygroundVariant, SnapshotStatus } from './model';

type WorkspaceBadgeVariant = 'primary' | 'neutral' | 'warning' | 'success';

export interface WorkspaceCardState {
  status: { label: string; variant: WorkspaceBadgeVariant };
  playgrounds: Playground[];
  selectedPlaygroundId: string;
  onSelectPlayground: (playgroundId: string) => void;
  onRefresh: () => void;
  name: string;
  onNameChange: (name: string) => void;
  description: string;
  onDescriptionChange: (description: string) => void;
  isSaving: boolean;
  canSave: boolean;
  isActive: boolean;
  selectedPlayground: Playground | null;
  notice: string | null;
  onSave: () => void;
  onNew: () => void;
  onDelete: () => void;
}

export interface RunBoardCardState {
  variants: PlaygroundVariant[];
  latestRunByVariant: ReadonlyMap<string, PlaygroundRun>;
  runningCount: number;
  runs: PlaygroundRun[];
  lastRun?: PlaygroundRun;
  onClear: () => void;
}

export interface SnapshotCardState {
  datasets: Dataset[];
  variants: PlaygroundVariant[];
  datasetId: string;
  onDatasetChange: (datasetId: string) => void;
  variantId: string;
  onVariantChange: (variantId: string) => void;
  name: string;
  onNameChange: (name: string) => void;
  hasModelRegistry: boolean;
  status: SnapshotStatus;
  error: string | null;
  experimentId: string | null;
  onSnapshot: () => void;
  onOpenExperiment: () => void;
}

export interface PlaygroundSidebarProps {
  workspace: WorkspaceCardState;
  runBoard: RunBoardCardState;
  snapshot: SnapshotCardState;
}
