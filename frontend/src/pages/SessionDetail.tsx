import React, { useMemo } from 'react';
import type { AgentRun, AgentSession } from '../types';
import { useSessionDetailData } from '../features/sessions/useSessionDetailData';
import { Badge, Button } from '../components/ui';
import { PageHeader } from '../layouts/PageHeader';
import SessionOverview from '../features/sessions/SessionOverview';
import SessionContextCards from '../features/sessions/SessionContextCards';
import SessionRunsPanel from '../features/sessions/SessionRunsPanel';
import SessionTimelinePanel from '../features/sessions/SessionTimelinePanel';
import SessionAnnotationsPanel from '../features/sessions/SessionAnnotationsPanel';
import { sessionStatusVariant } from '../features/sessions/sessionDisplay';
import ShareLinkModal from '../features/collaboration/ShareLinkModal';
import { useShareLink } from '../features/collaboration/useShareLink';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';

interface SessionDetailProps {
  session: AgentSession;
  runs: AgentRun[];
  onBack: () => void;
  onOpenRun: (runId: string) => void;
}

const SessionDetail: React.FC<SessionDetailProps> = ({ session, runs, onBack, onOpenRun }) => {
  const {
    timeline,
    annotations,
    setAnnotations,
    timelineError,
    annotationsError,
  } = useSessionDetailData(session.id);
  const shareLink = useShareLink({
    projectId: session.project_id ?? undefined,
    objectType: 'agent_session',
    objectId: session.id,
  }, { clipboardUnavailableMessage: null });

  const sortedRuns = useMemo(() => {
    return [...runs].sort((a, b) => (b.started_at || 0) - (a.started_at || 0));
  }, [runs]);

  const lastStatus = session.last_status || sortedRuns[0]?.status || null;

  return (
    <div className="h-full flex flex-col bg-app">
      <PageHeader
        title={session.agent_name || 'Agent Runs'}
        subtitle={`Run group ${session.id}`}
        badge={<Badge variant={sessionStatusVariant(session.status)}>{session.status}</Badge>}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => void shareLink.open()}>
              Share
            </Button>
            <Button variant="secondary" size="sm" onClick={onBack}>
              <ArrowLeftIcon className="w-4 h-4" />
              Back to Agent Runs
            </Button>
          </div>
        }
      />

      <SessionOverview session={session} runs={runs} />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <SessionContextCards session={session} lastStatus={lastStatus} />
        <SessionRunsPanel runs={sortedRuns} onOpenRun={onOpenRun} />

        {/* Timeline and Annotations */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SessionTimelinePanel timeline={timeline} error={timelineError} />
          <SessionAnnotationsPanel
            sessionId={session.id}
            annotations={annotations}
            annotationsError={annotationsError}
            onAnnotationCreated={(created) => setAnnotations((current) => [created, ...current])}
          />
        </div>
      </div>

      <ShareLinkModal
        open={shareLink.isOpen}
        title="Share Session"
        description="Create a public link to share this session."
        audienceDescription="Anyone with this link can view this session."
        loading={shareLink.isLoading}
        error={shareLink.error}
        url={shareLink.url}
        copied={shareLink.isCopied}
        onClose={shareLink.close}
        onCopy={() => void shareLink.copy()}
      />
    </div>
  );
};

export default SessionDetail;
