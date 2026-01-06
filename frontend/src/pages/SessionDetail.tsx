import React, { useEffect, useMemo, useState } from 'react';
import { AgentRun, AgentSession, SessionAnnotation, SessionEvent } from '../types';
import { api } from '../lib/api';
import { Badge, Button, Card, Input, Select, SectionHeader, Textarea, Modal } from '../components/ui';
import { PageHeader } from '../layouts/PageHeader';
import {
  ArrowLeftIcon,
  ArrowTopRightOnSquareIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  TagIcon,
  DocumentTextIcon,
  ChatBubbleLeftEllipsisIcon,
  PlayCircleIcon,

  CurrencyDollarIcon,
  LinkIcon,
} from '@heroicons/react/24/outline';

interface SessionDetailProps {
  session: AgentSession;
  runs: AgentRun[];
  onBack: () => void;
  onOpenRun: (runId: string) => void;
}

const formatTimestamp = (value?: number | null) => {
  if (!value) return '--';
  return new Date(value).toLocaleString();
};

const formatRelativeTime = (value?: number | null) => {
  if (!value) return '--';
  const date = new Date(value);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 60 * 1000) return 'Just now';
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))}m ago`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))}h ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const formatDuration = (start?: number, end?: number | null) => {
  if (!start || !end) return '--';
  const delta = Math.max(end - start, 0);
  if (delta < 1000) return `${delta}ms`;
  if (delta < 60 * 1000) return `${(delta / 1000).toFixed(1)}s`;
  return `${Math.floor(delta / 60000)}m ${Math.floor((delta % 60000) / 1000)}s`;
};

const statusVariant = (status: string): 'neutral' | 'primary' | 'success' | 'warning' | 'danger' => {
  switch (status) {
    case 'error':
      return 'danger';
    case 'active':
      return 'primary';
    case 'completed':
      return 'success';
    case 'open':
      return 'warning';
    case 'resolved':
      return 'success';
    default:
      return 'neutral';
  }
};

const formatEventType = (value: string) => {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const SessionDetail: React.FC<SessionDetailProps> = ({ session, runs, onBack, onOpenRun }) => {
  const [timeline, setTimeline] = useState<SessionEvent[]>([]);
  const [annotations, setAnnotations] = useState<SessionAnnotation[]>([]);
  const [annotationNote, setAnnotationNote] = useState('');
  const [annotationLabels, setAnnotationLabels] = useState('');
  const [annotationSeverity, setAnnotationSeverity] = useState('');
  const [annotationStatus, setAnnotationStatus] = useState('open');
  const [annotationBusy, setAnnotationBusy] = useState(false);

  // Share State
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);

  useEffect(() => {
    if (!session.id) return;
    api.getSessionTimeline(session.id, { limit: 200 }).then(setTimeline).catch(() => setTimeline([]));
    api.getSessionAnnotations(session.id).then(setAnnotations).catch(() => setAnnotations([]));
  }, [session.id]);

  const sortedRuns = useMemo(() => {
    return [...runs].sort((a, b) => (b.started_at || 0) - (a.started_at || 0));
  }, [runs]);

  const runCount = session.run_count ?? runs.length;
  const errorCount = session.error_count ?? runs.filter((run) => run.status === 'error').length;
  const lastStatus = session.last_status || sortedRuns[0]?.status || null;

  const stats = useMemo(() => {
    const totalTokens = runs.reduce((acc, r) => acc + (r.total_tokens || 0), 0);
    const totalCost = runs.reduce((acc, r) => acc + (r.total_cost || 0), 0);
    const avgLatency = runs.length
      ? runs.reduce((acc, r) => acc + (r.total_latency || 0), 0) / runs.length
      : 0;
    return { totalTokens, totalCost, avgLatency };
  }, [runs]);

  const handleCreateAnnotation = async () => {
    if (!annotationNote.trim() && !annotationLabels.trim()) return;
    setAnnotationBusy(true);
    try {
      const labels = annotationLabels
        .split(',')
        .map((label) => label.trim())
        .filter(Boolean);
      const created = await api.createSessionAnnotation(session.id, {
        labels,
        severity: annotationSeverity || undefined,
        status: annotationStatus,
        note: annotationNote.trim() || undefined,
      });
      setAnnotations((prev) => [created, ...prev]);
      setAnnotationNote('');
      setAnnotationLabels('');
      setAnnotationSeverity('');
      setAnnotationStatus('open');
    } finally {
      setAnnotationBusy(false);
    }
  };

  const buildShareUrl = (token: string) => {
    const base = `${window.location.origin}${window.location.pathname}`;
    return `${base}#/share-links/${token}`;
  };

  const openShareModal = async () => {
    setShareModalOpen(true);
    setShareLoading(true);
    setShareError(null);
    setShareUrl(null);
    setShareCopied(false);
    try {
      const created = await api.createShareLink({
        project_id: session.project_id,
        object_type: 'agent_session',
        object_id: session.id,
      });
      setShareUrl(buildShareUrl(created.token));
    } catch (e: any) {
      setShareError(e?.message || 'Failed to create share link');
    } finally {
      setShareLoading(false);
    }
  };

  const copyShareUrl = async () => {
    if (!shareUrl || !navigator.clipboard) return;
    await navigator.clipboard.writeText(shareUrl);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  };

  return (
    <div className="h-full flex flex-col bg-app">
      <PageHeader
        title={session.agent_name || 'Agent Runs'}
        subtitle={`Run group ${session.id}`}
        badge={<Badge variant={statusVariant(session.status)}>{session.status}</Badge>}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={openShareModal}>
              <LinkIcon className="w-4 h-4" />
              Share
            </Button>
            <Button variant="secondary" size="sm" onClick={onBack}>
              <ArrowLeftIcon className="w-4 h-4" />
              Back to Agent Runs
            </Button>
          </div>
        }
      />

      {/* Stats Bar */}
      <div className="px-6 py-4 flex flex-wrap items-center gap-6 border-b border-border-hairline bg-panel">
        <div className="flex items-center gap-2">
          <span className="icon-chip icon-chip--sky">
            <PlayCircleIcon className="w-4 h-4" />
          </span>
          <div>
            <div className="text-lg font-bold text-text-main">{runCount}</div>
            <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold">Runs</div>
          </div>
        </div>
        <div className="w-px h-8 bg-border-hairline" />
        <div className="flex items-center gap-2">
          <span className="icon-chip icon-chip--rose">
            <ExclamationTriangleIcon className="w-4 h-4" />
          </span>
          <div>
            <div className={`text-lg font-bold ${errorCount > 0 ? 'text-rose-500' : 'text-text-main'}`}>
              {errorCount}
            </div>
            <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold">Errors</div>
          </div>
        </div>
        <div className="w-px h-8 bg-border-hairline" />
        <div className="flex items-center gap-2">
          <span className="icon-chip icon-chip--indigo">
            <DocumentTextIcon className="w-4 h-4" />
          </span>
          <div>
            <div className="text-lg font-bold text-text-main">{stats.totalTokens.toLocaleString()}</div>
            <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold">Tokens</div>
          </div>
        </div>
        <div className="w-px h-8 bg-border-hairline" />
        <div className="flex items-center gap-2">
          <span className="icon-chip icon-chip--amber">
            <CurrencyDollarIcon className="w-4 h-4" />
          </span>
          <div>
            <div className="text-lg font-bold text-text-main">${stats.totalCost.toFixed(4)}</div>
            <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold">Cost</div>
          </div>
        </div>
        <div className="w-px h-8 bg-border-hairline" />
        <div className="flex items-center gap-2">
          <span className="icon-chip icon-chip--slate">
            <ClockIcon className="w-4 h-4" />
          </span>
          <div>
            <div className="text-lg font-bold text-text-main">{stats.avgLatency.toFixed(0)}ms</div>
            <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold">Avg Latency</div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Info Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 animate-soft-in">
          <Card>
            <div className="flex items-center gap-3 mb-3">
              <span className="icon-chip icon-chip--mint">
                <PlayCircleIcon className="w-4 h-4" />
              </span>
              <h3 className="text-sm font-semibold text-text-main">Context</h3>
            </div>
            <div className="space-y-3">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold mb-1">Agent</div>
                <div className="text-sm text-text-main font-medium">{session.agent_name || 'Unknown'}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold mb-1">Environment</div>
                <div className="text-sm text-text-main font-medium">{session.env || 'Not specified'}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold mb-1">Last run</div>
                <div className="text-sm text-text-main font-medium">{formatTimestamp(session.last_run_at)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold mb-1">Last status</div>
                {lastStatus ? (
                  <Badge variant={statusVariant(lastStatus)} className="mt-1">{lastStatus}</Badge>
                ) : (
                  <span className="text-sm text-text-muted">--</span>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-3 mb-3">
              <span className="icon-chip icon-chip--copper">
                <TagIcon className="w-4 h-4" />
              </span>
              <h3 className="text-sm font-semibold text-text-main">Tags</h3>
            </div>
            {session.tags.length === 0 ? (
              <p className="text-sm text-text-muted">No tags attached</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {session.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs px-2.5 py-1 rounded-full bg-app border border-border-base text-text-main font-medium"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <div className="flex items-center gap-3 mb-3">
              <span className="icon-chip icon-chip--slate">
                <DocumentTextIcon className="w-4 h-4" />
              </span>
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

        {/* Runs Section */}
        <Card padded={false} className="animate-soft-in" style={{ animationDelay: '50ms' }}>
          <div className="px-5 py-4 border-b border-border-hairline">
            <div className="flex items-center gap-3">
              <span className="icon-chip icon-chip--sky">
                <PlayCircleIcon className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-text-main">Runs</h3>
                <p className="text-xs text-text-muted">Latest runs in this session</p>
              </div>
            </div>
          </div>
          <div className="divide-y divide-border-hairline">
            {sortedRuns.length === 0 ? (
              <div className="px-6 py-8 text-center text-sm text-text-muted">
                <PlayCircleIcon className="w-8 h-8 mx-auto mb-2 opacity-40" />
                No runs yet
              </div>
            ) : (
              sortedRuns.map((run, index) => (
                <div
                  key={run.id}
                  className="px-5 py-4 flex items-center gap-4 hover:bg-panel-hover transition-colors cursor-pointer group"
                  onClick={() => onOpenRun(run.id)}
                >
                  <div
                    className={`w-2 h-2 rounded-full shrink-0 ${run.status === 'error'
                      ? 'bg-rose-500'
                      : run.status === 'active'
                        ? 'bg-primary animate-pulse'
                        : 'bg-emerald-500'
                      }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono font-medium text-text-main truncate">
                        {run.id}
                      </span>
                      <Badge variant={statusVariant(run.status)} className="shrink-0">
                        {run.status}
                      </Badge>
                    </div>
                    <div className="text-xs text-text-muted mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span>{formatRelativeTime(run.started_at)}</span>
                      <span>•</span>
                      <span>{formatDuration(run.started_at, run.ended_at)}</span>
                      {run.trace_id && (
                        <>
                          <span>•</span>
                          <span className="font-mono text-[10px]">Trace: {run.trace_id.slice(0, 8)}...</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm text-text-main font-medium">
                      {run.total_tokens?.toLocaleString() ?? '--'} tokens
                    </div>
                    <div className="text-xs text-text-muted">${run.total_cost?.toFixed(4) ?? '--'}</div>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenRun(run.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                    View
                  </Button>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Timeline and Annotations */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Timeline */}
          <Card padded={false} className="animate-soft-in" style={{ animationDelay: '100ms' }}>
            <div className="px-5 py-4 border-b border-border-hairline">
              <div className="flex items-center gap-3">
                <span className="icon-chip icon-chip--indigo">
                  <ClockIcon className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-text-main">Timeline</h3>
                  <p className="text-xs text-text-muted">Ordered events in this session</p>
                </div>
              </div>
            </div>
            <div className="max-h-[400px] overflow-y-auto divide-y divide-border-hairline">
              {timeline.length === 0 ? (
                <div className="px-6 py-8 text-center text-sm text-text-muted">
                  <ClockIcon className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No timeline events yet
                </div>
              ) : (
                timeline.map((event) => (
                  <div key={event.id} className="px-5 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-text-main">
                        {formatEventType(event.event_type)}
                      </span>
                      <span className="text-[10px] text-text-muted font-mono">
                        {formatRelativeTime(event.timestamp)}
                      </span>
                    </div>
                    {event.payload && Object.keys(event.payload).length > 0 && (
                      <pre className="text-[11px] text-text-muted whitespace-pre-wrap bg-app rounded-md p-2 border border-border-hairline max-h-24 overflow-y-auto">
                        {JSON.stringify(event.payload, null, 2)}
                      </pre>
                    )}
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Annotations */}
          <Card padded={false} className="animate-soft-in" style={{ animationDelay: '150ms' }}>
            <div className="px-5 py-4 border-b border-border-hairline">
              <div className="flex items-center gap-3">
                <span className="icon-chip icon-chip--coral">
                  <ChatBubbleLeftEllipsisIcon className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-text-main">Annotations</h3>
                  <p className="text-xs text-text-muted">Human notes and decisions</p>
                </div>
              </div>
            </div>

            {/* Add annotation form */}
            <div className="px-5 py-4 space-y-3 border-b border-border-hairline bg-app/50">
              <Textarea
                className="h-20 resize-none"
                placeholder="Add a note or decision..."
                value={annotationNote}
                onChange={(e) => setAnnotationNote(e.target.value)}
              />
              <div className="flex flex-wrap gap-3">
                <Input
                  value={annotationLabels}
                  onChange={(e) => setAnnotationLabels(e.target.value)}
                  placeholder="Labels (comma-separated)"
                  className="flex-1 min-w-[140px]"
                />
                <Input
                  value={annotationSeverity}
                  onChange={(e) => setAnnotationSeverity(e.target.value)}
                  placeholder="Severity"
                  className="w-28"
                />
                <Select
                  value={annotationStatus}
                  onChange={(e) => setAnnotationStatus(e.target.value)}
                  className="w-28"
                >
                  <option value="open">Open</option>
                  <option value="resolved">Resolved</option>
                </Select>
                <Button variant="primary" size="sm" onClick={handleCreateAnnotation} disabled={annotationBusy}>
                  Add Note
                </Button>
              </div>
            </div>

            {/* Annotations list */}
            <div className="max-h-[320px] overflow-y-auto divide-y divide-border-hairline">
              {annotations.length === 0 ? (
                <div className="px-6 py-8 text-center text-sm text-text-muted">
                  <ChatBubbleLeftEllipsisIcon className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No annotations yet
                </div>
              ) : (
                annotations.map((annotation) => (
                  <div key={annotation.id} className="px-5 py-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant={statusVariant(annotation.status)}>{annotation.status}</Badge>
                      {annotation.severity && (
                        <span className="text-[10px] uppercase tracking-widest text-text-muted font-semibold">
                          {annotation.severity}
                        </span>
                      )}
                      <span className="text-[10px] text-text-muted font-mono ml-auto">
                        {formatRelativeTime(annotation.created_at)}
                      </span>
                    </div>
                    {annotation.note && (
                      <p className="text-sm text-text-main mt-2 leading-relaxed">{annotation.note}</p>
                    )}
                    {annotation.labels.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {annotation.labels.map((label) => (
                          <span
                            key={label}
                            className="text-[10px] px-2 py-0.5 rounded-full bg-app border border-border-base text-text-muted font-medium"
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>


      {/* Share Modal */}
      < Modal
        open={shareModalOpen}
        title="Share Session"
        description="Create a public link to share this session."
        onClose={() => setShareModalOpen(false)}
        footer={< div className="flex justify-end" >
          <Button variant="primary" onClick={() => setShareModalOpen(false)}>Done</Button>
        </div >}
      >
        {
          shareLoading ? (
            <div className="py-8 text-center text-text-muted italic" > Generating link...</div>
          ) : shareError ? (
            <div className="text-rose-500 text-sm">{shareError}</div>
          ) : (
            <div className="space-y-4">
              <div className="text-sm font-medium text-text-main">Share Link</div>
              <div className="flex gap-2">
                <Input value={shareUrl || ''} readOnly className="font-mono text-xs" />
                <Button onClick={copyShareUrl} variant={shareCopied ? 'success' : 'secondary'}>
                  {shareCopied ? 'Copied' : 'Copy'}
                </Button>
              </div>
              <p className="text-xs text-text-muted">
                Anyone with this link can view this session.
              </p>
            </div>
          )}
      </Modal >
    </div >
  );
};

export default SessionDetail;
