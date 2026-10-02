import React from 'react';
import { DocumentTextIcon, PlayCircleIcon, TagIcon } from '@heroicons/react/24/outline';
import type { AgentSession } from '../../types';
import { Badge, Card } from '../../components/ui';
import { sessionStatusVariant } from './sessionDisplay';

interface SessionContextCardsProps {
  session: AgentSession;
  lastStatus: string | null;
}

const SessionContextCards: React.FC<SessionContextCardsProps> = ({ session, lastStatus }) => (
  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 animate-soft-in">
    <Card>
      <div className="flex items-center gap-3 mb-3">
        <span className="icon-chip icon-chip--mint"><PlayCircleIcon className="w-4 h-4" /></span>
        <h3 className="text-sm font-semibold text-text-main">Context</h3>
      </div>
      <div className="space-y-3">
        <ContextValue label="Agent" value={session.agent_name || 'Unknown'} />
        <ContextValue label="Environment" value={session.env || 'Not specified'} />
        <ContextValue label="Last run" value={formatTimestamp(session.last_run_at)} />
        <div>
          <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold mb-1">Last status</div>
          {lastStatus ? (
            <Badge variant={sessionStatusVariant(lastStatus)} className="mt-1">{lastStatus}</Badge>
          ) : (
            <span className="text-sm text-text-muted">--</span>
          )}
        </div>
      </div>
    </Card>

    <Card>
      <div className="flex items-center gap-3 mb-3">
        <span className="icon-chip icon-chip--copper"><TagIcon className="w-4 h-4" /></span>
        <h3 className="text-sm font-semibold text-text-main">Tags</h3>
      </div>
      {session.tags.length === 0 ? (
        <p className="text-sm text-text-muted">No tags attached</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {session.tags.map((tag) => (
            <span key={tag} className="text-xs px-2.5 py-1 rounded-full bg-app border border-border-base text-text-main font-medium">
              {tag}
            </span>
          ))}
        </div>
      )}
    </Card>

    <Card>
      <div className="flex items-center gap-3 mb-3">
        <span className="icon-chip icon-chip--slate"><DocumentTextIcon className="w-4 h-4" /></span>
        <h3 className="text-sm font-semibold text-text-main">Metadata</h3>
      </div>
      {session.metadata && Object.keys(session.metadata).length > 0 ? (
        <pre className="text-xs text-text-muted whitespace-pre-wrap bg-app rounded-lg p-3 border border-border-hairline max-h-32 overflow-y-auto">
          {JSON.stringify(session.metadata, null, 2)}
        </pre>
      ) : (
        <p className="text-sm text-text-muted">No metadata</p>
      )}
    </Card>
  </div>
);

const ContextValue: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold mb-1">{label}</div>
    <div className="text-sm text-text-main font-medium">{value}</div>
  </div>
);

const formatTimestamp = (value?: number | null) => value ? new Date(value).toLocaleString() : '--';

export default SessionContextCards;
