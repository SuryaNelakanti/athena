import { useState } from 'react';
import { Button } from '../components/ui';
import { CollaborationRecords } from '../features/collaboration/CollaborationRecords';
import { useCollaborationData } from '../features/collaboration/useCollaborationData';
import { useProject } from '../contexts/ProjectContext';

type CollaborationTab = 'assignments' | 'mentions' | 'share-links';

const tabs: { id: CollaborationTab; label: string }[] = [
  { id: 'assignments', label: 'Assignments' },
  { id: 'mentions', label: 'Mentions' },
  { id: 'share-links', label: 'Share Links' },
];

const recordKindByTab: Record<CollaborationTab, 'assignment' | 'mention' | 'share-link'> = {
  assignments: 'assignment',
  mentions: 'mention',
  'share-links': 'share-link',
};

export default function Collaboration() {
  const { currentProject } = useProject();
  const [activeTab, setActiveTab] = useState<CollaborationTab>('assignments');
  const { assignments, error, loading, mentions, retry, shareLinks } = useCollaborationData(currentProject.id);

  const activeRecords = activeTab === 'assignments'
    ? assignments
    : activeTab === 'mentions'
      ? mentions
      : shareLinks;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border-hairline bg-panel px-6 py-5">
        <h1 className="text-2xl font-serif font-bold tracking-tight text-text-main">Collaboration</h1>
        <p className="mt-1.5 text-sm text-text-muted">Assignments, mentions, and share links for this project.</p>
      </header>

      <section className="flex-1 overflow-y-auto px-6 py-5" aria-label="Project collaboration">
        <div className="mb-5 flex gap-2" aria-label="Collaboration items">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              aria-pressed={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${activeTab === tab.id
                ? 'bg-primary/10 text-primary'
                : 'text-text-muted hover:bg-panel-hover hover:text-text-main'
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {error ? (
          <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-5" role="alert">
            <p className="text-sm text-rose-600">{error}</p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={retry}>Retry</Button>
          </div>
        ) : loading ? (
          <p className="py-10 text-center text-sm text-text-muted">Loading collaboration items...</p>
        ) : (
          <CollaborationRecords kind={recordKindByTab[activeTab]} records={activeRecords} />
        )}
      </section>
    </div>
  );
}
