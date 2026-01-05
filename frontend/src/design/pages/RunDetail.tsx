import React, { useEffect, useMemo, useState } from 'react';
import { AgentRun, RunGraph } from '../../types';
import { api } from '../../services/api';
import { Badge, Button, Card, SectionHeader } from '../ui';
import { PageHeader } from '../layout/PageHeader';
import RunGraphComponent from '../components/RunGraph';
import {
  ArrowLeftIcon,
  ArrowTopRightOnSquareIcon,
  ClockIcon,
  CurrencyDollarIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  PlayCircleIcon,
  TagIcon,
} from '@heroicons/react/24/outline';

interface RunDetailProps {
  runId: string;
  onBack: (sessionId?: string) => void;
  onOpenTrace?: (traceId: string) => void;
}

const formatTimestamp = (value?: number | null) => {
  if (!value) return '--';
  return new Date(value).toLocaleString();
};

const formatDuration = (start?: number, end?: number | null) => {
  if (!start || !end) return '--';
  const delta = Math.max(end - start, 0);
  if (delta < 1000) return `${delta}ms`;
  if (delta < 60 * 1000) return `${(delta / 1000).toFixed(2)}s`;
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
    default:
      return 'neutral';
  }
};

const RunDetail: React.FC<RunDetailProps> = ({ runId, onBack, onOpenTrace }) => {
  const [run, setRun] = useState<AgentRun | null>(null);
  const [graph, setGraph] = useState<RunGraph | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [graphError, setGraphError] = useState<string | null>(null);

  useEffect(() => {
    if (!runId) return;
    setLoading(true);
    setGraphError(null);

    // Fetch run first
    api
      .getRun(runId)
      .then((runData) => {
        setRun(runData);
        // Only fetch graph if run has a trace_id
        if (runData.trace_id) {
          return api
            .getRunGraph(runId)
            .then((graphData) => {
              setGraph(graphData);
              setSelectedNodeId(graphData.root_id || graphData.nodes[0]?.id || null);
            })
            .catch((err) => {
              setGraph(null);
              setGraphError(err.message || 'Failed to load run graph');
            });
        } else {
          setGraph(null);
          setGraphError('This run has no associated trace');
        }
      })
      .catch(() => {
        setRun(null);
        setGraph(null);
      })
      .finally(() => setLoading(false));
  }, [runId]);

  const selectedNode = useMemo(() => {
    if (!graph || !selectedNodeId) return null;
    return graph.nodes.find((node) => node.id === selectedNodeId) || null;
  }, [graph, selectedNodeId]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-app animate-pulse">
        <div className="text-center">
          <div className="icon-chip icon-chip--sky icon-chip-lg mx-auto mb-4">
            <PlayCircleIcon className="w-6 h-6" />
          </div>
          <p className="text-text-muted">Loading run...</p>
        </div>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-app text-text-muted">
        <div className="icon-chip icon-chip--rose icon-chip-lg mb-4">
          <ExclamationTriangleIcon className="w-6 h-6" />
        </div>
        <p className="mb-4">Run not found.</p>
        <Button variant="secondary" size="sm" onClick={() => onBack()}>
          <ArrowLeftIcon className="w-4 h-4" />
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-app">
      <PageHeader
        title={`Run ${run.id.slice(0, 16)}...`}
        subtitle={`Session: ${run.session_id}`}
        badge={<Badge variant={statusVariant(run.status)}>{run.status}</Badge>}
        actions={
          <div className="flex items-center gap-2">
            {run.trace_id && onOpenTrace && (
              <Button variant="secondary" size="sm" onClick={() => onOpenTrace(run.trace_id!)}>
                <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                Open Trace
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => onBack(run.session_id)}>
              <ArrowLeftIcon className="w-4 h-4" />
              Back to Session
            </Button>
          </div>
        }
      />

      {/* Stats Bar */}
      <div className="px-6 py-4 flex flex-wrap items-center gap-6 border-b border-border-hairline bg-panel">
        <div className="flex items-center gap-2">
          <span className="icon-chip icon-chip--slate">
            <ClockIcon className="w-4 h-4" />
          </span>
          <div>
            <div className="text-sm font-medium text-text-main">{formatTimestamp(run.started_at)}</div>
            <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold">Started</div>
          </div>
        </div>
        <div className="w-px h-8 bg-border-hairline" />
        <div className="flex items-center gap-2">
          <span className="icon-chip icon-chip--mint">
            <PlayCircleIcon className="w-4 h-4" />
          </span>
          <div>
            <div className="text-sm font-medium text-text-main">
              {formatDuration(run.started_at, run.ended_at)}
            </div>
            <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold">Duration</div>
          </div>
        </div>
        <div className="w-px h-8 bg-border-hairline" />
        <div className="flex items-center gap-2">
          <span className="icon-chip icon-chip--indigo">
            <DocumentTextIcon className="w-4 h-4" />
          </span>
          <div>
            <div className="text-sm font-medium text-text-main">
              {run.total_tokens?.toLocaleString() ?? '--'}
            </div>
            <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold">Tokens</div>
          </div>
        </div>
        <div className="w-px h-8 bg-border-hairline" />
        <div className="flex items-center gap-2">
          <span className="icon-chip icon-chip--amber">
            <CurrencyDollarIcon className="w-4 h-4" />
          </span>
          <div>
            <div className="text-sm font-medium text-text-main">
              ${run.total_cost?.toFixed(4) ?? '--'}
            </div>
            <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold">Cost</div>
          </div>
        </div>
        {run.trace_id && (
          <>
            <div className="w-px h-8 bg-border-hairline" />
            <div>
              <div className="text-sm font-mono text-text-main truncate max-w-[200px]">{run.trace_id}</div>
              <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold">Trace ID</div>
            </div>
          </>
        )}
      </div>

      {/* Tags & Metadata (if present) */}
      {((run.tags?.length ?? 0) > 0 || (run.metadata && Object.keys(run.metadata).length > 0)) && (
        <div className="px-6 py-3 flex flex-wrap gap-4 border-b border-border-hairline bg-panel/50">
          {(run.tags?.length ?? 0) > 0 && (
            <div className="flex items-center gap-2">
              <TagIcon className="w-4 h-4 text-text-muted" />
              <div className="flex flex-wrap gap-1.5">
                {run.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs px-2 py-0.5 rounded-full bg-app border border-border-base text-text-muted font-medium"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
          {run.metadata && Object.keys(run.metadata).length > 0 && (
            <details className="group">
              <summary className="cursor-pointer text-[10px] uppercase tracking-widest text-text-muted font-bold flex items-center gap-1">
                <DocumentTextIcon className="w-4 h-4" />
                Run Metadata
              </summary>
              <pre className="text-[11px] text-text-muted whitespace-pre-wrap bg-app border border-border-base rounded-md p-3 mt-2 max-w-lg">
                {JSON.stringify(run.metadata, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-hidden p-6 flex gap-6">
        {/* Graph Panel */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0 animate-soft-in">
          <Card padded={false} className="flex-1 flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-border-hairline">
              <div className="flex items-center gap-3">
                <span className="icon-chip icon-chip--sky">
                  <PlayCircleIcon className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-text-main">Run Graph</h3>
                  <p className="text-xs text-text-muted">Trajectory view derived from spans</p>
                </div>
              </div>
            </div>
            <div className="flex-1 min-h-0 p-4">
              {graphError ? (
                <div className="h-full flex flex-col items-center justify-center text-text-muted">
                  <div className="icon-chip icon-chip--slate icon-chip-lg mb-4">
                    <ExclamationTriangleIcon className="w-5 h-5" />
                  </div>
                  <p className="text-sm">{graphError}</p>
                </div>
              ) : graph ? (
                <RunGraphComponent
                  graph={graph}
                  selectedNodeId={selectedNodeId}
                  onSelectNode={setSelectedNodeId}
                />
              ) : (
                <div className="h-full flex items-center justify-center text-text-muted">
                  <p className="text-sm">No graph data available</p>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Node Detail Panel */}
        <div className="w-[380px] shrink-0 animate-soft-in" style={{ animationDelay: '50ms' }}>
          <Card padded={false} className="h-full flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-border-hairline">
              <div className="flex items-center gap-3">
                <span className="icon-chip icon-chip--indigo">
                  <DocumentTextIcon className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-text-main">Node Detail</h3>
                  <p className="text-xs text-text-muted">Inputs, outputs, and metadata</p>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {selectedNode ? (
                <div className="space-y-5">
                  {/* Node Header */}
                  <div className="pb-4 border-b border-border-hairline">
                    <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold mb-1">
                      Span
                    </div>
                    <div className="text-sm font-semibold text-text-main">{selectedNode.name}</div>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="neutral">{selectedNode.kind}</Badge>
                      <Badge variant={statusVariant(selectedNode.status)}>{selectedNode.status}</Badge>
                    </div>
                  </div>

                  {/* Duration */}
                  <div>
                    <div className="flex items-center gap-2 text-text-muted mb-1">
                      <ClockIcon className="w-3.5 h-3.5" />
                      <span className="text-[10px] uppercase tracking-widest font-semibold">Duration</span>
                    </div>
                    <div className="text-sm font-medium text-text-main">
                      {Math.round(selectedNode.duration_ms)}ms
                    </div>
                  </div>

                  {/* Input */}
                  <details className="group" open>
                    <summary className="cursor-pointer text-[10px] uppercase tracking-widest text-text-muted font-bold mb-2 flex items-center gap-1">
                      Input
                    </summary>
                    <pre className="text-[11px] text-text-muted whitespace-pre-wrap bg-app border border-border-hairline rounded-lg p-3 max-h-48 overflow-y-auto">
                      {JSON.stringify(selectedNode.input || {}, null, 2)}
                    </pre>
                  </details>

                  {/* Output */}
                  <details className="group" open>
                    <summary className="cursor-pointer text-[10px] uppercase tracking-widest text-text-muted font-bold mb-2 flex items-center gap-1">
                      Output
                    </summary>
                    <pre className="text-[11px] text-text-muted whitespace-pre-wrap bg-app border border-border-hairline rounded-lg p-3 max-h-48 overflow-y-auto">
                      {JSON.stringify(selectedNode.output || {}, null, 2)}
                    </pre>
                  </details>

                  {/* Metrics */}
                  {selectedNode.metrics && Object.keys(selectedNode.metrics).length > 0 && (
                    <details className="group">
                      <summary className="cursor-pointer text-[10px] uppercase tracking-widest text-text-muted font-bold mb-2 flex items-center gap-1">
                        Metrics
                      </summary>
                      <pre className="text-[11px] text-text-muted whitespace-pre-wrap bg-app border border-border-hairline rounded-lg p-3 max-h-32 overflow-y-auto">
                        {JSON.stringify(selectedNode.metrics, null, 2)}
                      </pre>
                    </details>
                  )}

                  {/* Attributes */}
                  {selectedNode.attributes && Object.keys(selectedNode.attributes).length > 0 && (
                    <details className="group">
                      <summary className="cursor-pointer text-[10px] uppercase tracking-widest text-text-muted font-bold mb-2 flex items-center gap-1">
                        Attributes
                      </summary>
                      <pre className="text-[11px] text-text-muted whitespace-pre-wrap bg-app border border-border-hairline rounded-lg p-3 max-h-32 overflow-y-auto">
                        {JSON.stringify(selectedNode.attributes, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-text-muted py-12">
                  <div className="icon-chip icon-chip--slate mb-4">
                    <DocumentTextIcon className="w-4 h-4" />
                  </div>
                  <p className="text-sm">Select a node to see details</p>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default RunDetail;
