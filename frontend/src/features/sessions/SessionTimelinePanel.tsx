import React from 'react';
import { ClockIcon } from '@heroicons/react/24/outline';
import type { SessionEvent } from '../../types';
import { Card } from '../../components/ui';
import { formatSessionEventType, formatSessionRelativeTime } from './sessionDisplay';

interface SessionTimelinePanelProps {
  timeline: SessionEvent[];
  error: string | null;
}

const SessionTimelinePanel: React.FC<SessionTimelinePanelProps> = ({ timeline, error }) => (
  <Card padded={false} className="animate-soft-in" style={{ animationDelay: '100ms' }}>
    <div className="px-5 py-4 border-b border-border-hairline">
      <div className="flex items-center gap-3">
        <span className="icon-chip icon-chip--indigo"><ClockIcon className="w-4 h-4" /></span>
        <div>
          <h3 className="text-sm font-semibold text-text-main">Timeline</h3>
          <p className="text-xs text-text-muted">Ordered events in this session</p>
        </div>
      </div>
    </div>
    <div className="max-h-[400px] overflow-y-auto divide-y divide-border-hairline">
      {timeline.length === 0 ? (
        <div className="px-6 py-8 text-center text-sm text-text-muted">
          {error ? (
            <span role="alert" className="text-rose-500">{error}</span>
          ) : (
            <>
              <ClockIcon className="w-8 h-8 mx-auto mb-2 opacity-40" />
              No timeline events yet
            </>
          )}
        </div>
      ) : timeline.map((event) => (
        <div key={event.id} className="px-5 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-text-main">{formatSessionEventType(event.event_type)}</span>
            <span className="text-[10px] text-text-muted font-mono">{formatSessionRelativeTime(event.timestamp)}</span>
          </div>
          {event.payload && Object.keys(event.payload).length > 0 && (
            <pre className="text-[11px] text-text-muted whitespace-pre-wrap bg-app rounded-md p-2 border border-border-hairline max-h-24 overflow-y-auto">
              {JSON.stringify(event.payload, null, 2)}
            </pre>
          )}
        </div>
      ))}
    </div>
  </Card>
);

export default SessionTimelinePanel;
