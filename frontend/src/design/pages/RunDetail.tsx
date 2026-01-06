import React, { useEffect, useMemo, useState } from 'react';
import { AgentRun, RunGraph } from '../../types';
import { api } from '../../services/api';
import { Badge, Button, Card, Input, Modal, Select, Textarea } from '../ui';
import { PageHeader } from '../layout/PageHeader';
import RunGraphComponent from '../components/RunGraph';
import {
  ArrowLeftIcon,
  ArrowTopRightOnSquareIcon,
  ClockIcon,
  CurrencyDollarIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  FolderPlusIcon,
  FlagIcon,
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

  // Modal state
  const [showDatasetModal, setShowDatasetModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [datasets, setDatasets] = useState<any[]>([]);
  const [datasetForm, setDatasetForm] = useState({ datasetId: '', label: 'gold', note: '' });
  const [reviewForm, setReviewForm] = useState({ labels: [] as string[], priority: 3, note: '' });
  const [submitting, setSubmitting] = useState(false);

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

  // Fetch datasets when modal opens
  useEffect(() => {
    if (showDatasetModal && run) {
      api.getDatasets(run.project_id).then(setDatasets).catch(() => setDatasets([]));
    }
  }, [showDatasetModal, run]);

  const handleAddToDataset = async () => {
    if (!run || !datasetForm.datasetId) return;
    setSubmitting(true);
    try {
      await api.promoteRunToDataset({
        run_id: run.id,
        dataset_id: datasetForm.datasetId,
        label: datasetForm.label,
        note: datasetForm.note || undefined,
      });
      setShowDatasetModal(false);
      setDatasetForm({ datasetId: '', label: 'gold', note: '' });
    } catch (err) {
      console.error('Failed to add to dataset', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddToReview = async () => {
    if (!run) return;
    setSubmitting(true);
    try {
      await api.createReview({
        project_id: run.project_id,
        source_type: 'run',
        source_id: run.id,
        priority: reviewForm.priority,
        labels: reviewForm.labels.length > 0 ? reviewForm.labels : undefined,
        notes: reviewForm.note || undefined,
      });
      setShowReviewModal(false);
      setReviewForm({ labels: [], priority: 3, note: '' });
    } catch (err) {
      console.error('Failed to add to review', err);
    } finally {
      setSubmitting(false);
    }
  };

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
            <Button variant="secondary" size="sm" onClick={() => setShowDatasetModal(true)}>
              <FolderPlusIcon className="w-4 h-4" />
              Add to Dataset
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setShowReviewModal(true)}>
              <FlagIcon className="w-4 h-4" />
              Add to Review
            </Button>
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

                  {/* Error Message (for error nodes) */}
                  {selectedNode.error_message && (
                    <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg">
                      <div className="flex items-center gap-2 text-rose-500 mb-2">
                        <ExclamationTriangleIcon className="w-4 h-4" />
                        <span className="text-[10px] uppercase tracking-widest font-bold">Error</span>
                      </div>
                      <p className="text-sm text-rose-600 dark:text-rose-400">
                        {selectedNode.error_message}
                      </p>
                    </div>
                  )}

                  {/* Causal Chain (for debugging) */}
                  {selectedNode.causal_chain && selectedNode.causal_chain.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 text-text-muted mb-2">
                        <span className="text-[10px] uppercase tracking-widest font-bold">Why did this happen?</span>
                      </div>
                      <div className="space-y-1">
                        {selectedNode.causal_chain.map((ancestor, idx) => (
                          <div
                            key={ancestor.id}
                            className={`text-xs px-3 py-2 rounded-lg border flex items-center gap-2 ${ancestor.status === 'error'
                              ? 'bg-rose-500/5 border-rose-500/20 text-rose-500'
                              : 'bg-app border-border-hairline text-text-muted'
                              }`}
                          >
                            <span className="text-text-muted/50">{idx + 1}.</span>
                            <span className="font-medium truncate">{ancestor.name}</span>
                            <span className={`ml-auto text-[9px] uppercase px-1.5 py-0.5 rounded font-semibold ${ancestor.status === 'error' ? 'bg-rose-500/10' : 'bg-emerald-500/10 text-emerald-600'
                              }`}>
                              {ancestor.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

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

      {/* Add to Dataset Modal */}
      <Modal open={showDatasetModal} onClose={() => setShowDatasetModal(false)} title="Add Run to Dataset">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-widest mb-2">
              Dataset
            </label>
            <Select
              value={datasetForm.datasetId}
              onChange={(e) => setDatasetForm((f) => ({ ...f, datasetId: e.target.value }))}
              className="w-full"
            >
              <option value="">Select a dataset...</option>
              {datasets.map((ds) => (
                <option key={ds.id} value={ds.id}>
                  {ds.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-widest mb-2">
              Label
            </label>
            <Select
              value={datasetForm.label}
              onChange={(e) => setDatasetForm((f) => ({ ...f, label: e.target.value }))}
              className="w-full"
            >
              <option value="gold">Gold (good example)</option>
              <option value="anti_pattern">Anti-Pattern (bad example)</option>
            </Select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-widest mb-2">
              Note (optional)
            </label>
            <Textarea
              value={datasetForm.note}
              onChange={(e) => setDatasetForm((f) => ({ ...f, note: e.target.value }))}
              placeholder="Add a note about this example..."
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-border-hairline">
            <Button variant="secondary" size="sm" onClick={() => setShowDatasetModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={!datasetForm.datasetId || submitting}
              onClick={handleAddToDataset}
            >
              {submitting ? 'Adding...' : 'Add to Dataset'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Add to Review Modal */}
      <Modal open={showReviewModal} onClose={() => setShowReviewModal(false)} title="Add Run to Review Queue">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-widest mb-2">
              Labels (comma-separated)
            </label>
            <Input
              value={reviewForm.labels.join(', ')}
              onChange={(e) =>
                setReviewForm((f) => ({
                  ...f,
                  labels: e.target.value
                    .split(',')
                    .map((l) => l.trim())
                    .filter(Boolean),
                }))
              }
              placeholder="e.g., hallucination, needs-review"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-widest mb-2">
              Priority (1-5)
            </label>
            <Select
              value={reviewForm.priority.toString()}
              onChange={(e) => setReviewForm((f) => ({ ...f, priority: parseInt(e.target.value, 10) }))}
              className="w-full"
            >
              <option value="1">1 - Low</option>
              <option value="2">2</option>
              <option value="3">3 - Normal</option>
              <option value="4">4</option>
              <option value="5">5 - High</option>
            </Select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-widest mb-2">
              Note (optional)
            </label>
            <Textarea
              value={reviewForm.note}
              onChange={(e) => setReviewForm((f) => ({ ...f, note: e.target.value }))}
              placeholder="Add a note about why this needs review..."
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-border-hairline">
            <Button variant="secondary" size="sm" onClick={() => setShowReviewModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" disabled={submitting} onClick={handleAddToReview}>
              {submitting ? 'Adding...' : 'Add to Review'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default RunDetail;
