import React, { useEffect, useRef, useState } from 'react';
import { ChatBubbleLeftEllipsisIcon } from '@heroicons/react/24/outline';
import type { SessionAnnotation } from '../../types';
import { api } from '../../lib/api';
import { getErrorMessage } from '../../lib/errors';
import { Badge, Button, Card, Input, Select, Textarea } from '../../components/ui';
import { formatSessionRelativeTime, sessionStatusVariant } from './sessionDisplay';

interface SessionAnnotationsPanelProps {
  sessionId: string;
  annotations: SessionAnnotation[];
  annotationsError: string | null;
  onAnnotationCreated: (annotation: SessionAnnotation) => void;
}

const SessionAnnotationsPanel: React.FC<SessionAnnotationsPanelProps> = ({
  sessionId,
  annotations,
  annotationsError,
  onAnnotationCreated,
}) => {
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  const [note, setNote] = useState('');
  const [labelsInput, setLabelsInput] = useState('');
  const [severity, setSeverity] = useState('');
  const [status, setStatus] = useState('open');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setNote('');
    setLabelsInput('');
    setSeverity('');
    setStatus('open');
    setBusy(false);
    setActionError(null);
  }, [sessionId]);

  const createAnnotation = async () => {
    if (!note.trim() && !labelsInput.trim()) return;
    const requestedSessionId = sessionId;
    setBusy(true);
    setActionError(null);
    try {
      const labels = labelsInput.split(',').map((label) => label.trim()).filter(Boolean);
      const created = await api.createSessionAnnotation(requestedSessionId, {
        labels,
        severity: severity || undefined,
        status,
        note: note.trim() || undefined,
      });
      if (sessionIdRef.current !== requestedSessionId) return;
      onAnnotationCreated(created);
      setNote('');
      setLabelsInput('');
      setSeverity('');
      setStatus('open');
    } catch (error: unknown) {
      if (sessionIdRef.current === requestedSessionId) {
        setActionError(getErrorMessage(error, 'Unable to save the annotation.'));
      }
    } finally {
      if (sessionIdRef.current === requestedSessionId) setBusy(false);
    }
  };

  return (
    <Card padded={false} className="animate-soft-in" style={{ animationDelay: '150ms' }}>
      <div className="px-5 py-4 border-b border-border-hairline">
        <div className="flex items-center gap-3">
          <span className="icon-chip icon-chip--coral"><ChatBubbleLeftEllipsisIcon className="w-4 h-4" /></span>
          <div>
            <h3 className="text-sm font-semibold text-text-main">Annotations</h3>
            <p className="text-xs text-text-muted">Human notes and decisions</p>
          </div>
        </div>
      </div>

      <div className="px-5 py-4 space-y-3 border-b border-border-hairline bg-app/50">
        {actionError && <div role="alert" className="text-sm text-rose-500">{actionError}</div>}
        <Textarea
          className="h-20 resize-none"
          placeholder="Add a note or decision..."
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        <div className="flex flex-wrap gap-3">
          <Input
            value={labelsInput}
            onChange={(event) => setLabelsInput(event.target.value)}
            placeholder="Labels (comma-separated)"
            className="flex-1 min-w-[140px]"
          />
          <Input
            value={severity}
            onChange={(event) => setSeverity(event.target.value)}
            placeholder="Severity"
            className="w-28"
          />
          <Select value={status} onChange={(event) => setStatus(event.target.value)} className="w-28">
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
          </Select>
          <Button variant="primary" size="sm" onClick={createAnnotation} disabled={busy}>Add Note</Button>
        </div>
      </div>

      <div className="max-h-[320px] overflow-y-auto divide-y divide-border-hairline">
        {annotations.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-text-muted">
            {annotationsError ? (
              <span role="alert" className="text-rose-500">{annotationsError}</span>
            ) : (
              <>
                <ChatBubbleLeftEllipsisIcon className="w-8 h-8 mx-auto mb-2 opacity-40" />
                No annotations yet
              </>
            )}
          </div>
        ) : annotations.map((annotation) => (
          <div key={annotation.id} className="px-5 py-4">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant={sessionStatusVariant(annotation.status)}>{annotation.status}</Badge>
              {annotation.severity && (
                <span className="text-[10px] uppercase tracking-widest text-text-muted font-semibold">{annotation.severity}</span>
              )}
              <span className="text-[10px] text-text-muted font-mono ml-auto">
                {formatSessionRelativeTime(annotation.created_at)}
              </span>
            </div>
            {annotation.note && <p className="text-sm text-text-main mt-2 leading-relaxed">{annotation.note}</p>}
            {annotation.labels.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {annotation.labels.map((label) => (
                  <span key={label} className="text-[10px] px-2 py-0.5 rounded-full bg-app border border-border-base text-text-muted font-medium">
                    {label}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
};

export default SessionAnnotationsPanel;
