import React from 'react';

import type { AgentSession } from '../types';
import { PageHeader } from '../layouts/PageHeader';
import { useProject } from '../contexts/ProjectContext';
import { SessionListControls } from '../features/sessions/SessionListControls';
import { SessionListResults } from '../features/sessions/SessionListResults';
import { useSessionListData } from '../features/sessions/useSessionListData';

interface SessionListProps {
  selectedSessionId?: string | null;
  onSelectSession: (session: AgentSession) => void;
  onOpenRun?: (runId: string) => void;
}

const SessionList: React.FC<SessionListProps> = ({
  selectedSessionId,
  onSelectSession,
  onOpenRun,
}) => {
  const { currentProject } = useProject();
  const projectId = currentProject?.id || '';
  const sessionList = useSessionListData(projectId);

  return (
    <div className="h-full flex flex-col bg-app">
      <PageHeader
        title="Agent Runs"
        subtitle="Run groups that capture agent trajectories and outcomes"
      />
      <SessionListControls
        stats={sessionList.stats}
        search={sessionList.search}
        agentName={sessionList.agentName}
        env={sessionList.env}
        status={sessionList.status}
        onSearchChange={sessionList.setSearch}
        onAgentNameChange={sessionList.setAgentName}
        onEnvironmentChange={sessionList.setEnv}
        onStatusChange={sessionList.setStatus}
      />
      <SessionListResults
        sessions={sessionList.sessions}
        loading={sessionList.loading}
        error={sessionList.loadError}
        selectedSessionId={selectedSessionId}
        onSelectSession={onSelectSession}
        onOpenRun={onOpenRun}
      />
    </div>
  );
};

export default SessionList;
