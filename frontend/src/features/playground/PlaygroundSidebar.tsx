import { PlaygroundRunBoardCard } from './PlaygroundRunBoardCard';
import { PlaygroundSnapshotCard } from './PlaygroundSnapshotCard';
import { PlaygroundWorkspaceCard } from './PlaygroundWorkspaceCard';
import type { PlaygroundSidebarProps } from './PlaygroundSidebarState';

export type {
  PlaygroundSidebarProps,
  RunBoardCardState,
  SnapshotCardState,
  WorkspaceCardState,
} from './PlaygroundSidebarState';

export const PlaygroundSidebar = ({ workspace, runBoard, snapshot }: PlaygroundSidebarProps) => (
  <aside className="space-y-6">
    <PlaygroundWorkspaceCard {...workspace} />
    <PlaygroundRunBoardCard {...runBoard} />
    <PlaygroundSnapshotCard {...snapshot} />
  </aside>
);
