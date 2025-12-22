import React, { useEffect, useMemo, useState } from 'react';
import {
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  InboxArrowDownIcon,
  ArrowUpRightIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@heroicons/react/24/outline';
import { api } from '../../services/api';
import { Dataset, ReviewItem } from '../../types';
import { Badge, Button, Card, Input, SectionHeader, Select, Tabs, Textarea } from '../ui';

interface ReviewQueueProps {
  projectId: string;
}

const STATUS_TABS = [
  { id: 'open', label: 'Open' },
  { id: 'in_review', label: 'In Review' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'dismissed', label: 'Dismissed' },
  { id: 'all', label: 'All' },
];

const ReviewQueue: React.FC<ReviewQueueProps> = ({ projectId }) => {
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'in_review' | 'resolved' | 'dismissed'>('open');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [promotion, setPromotion] = useState({
    datasetId: '',
    exampleType: 'gold' as 'gold' | 'anti_pattern',
    correctedExpected: '',
    useCorrection: false,
  });

  // Expandable sections
  const [inputExpanded, setInputExpanded] = useState(true);
  const [outputExpanded, setOutputExpanded] = useState(true);
  // Editable notes
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');

  const loadReviews = async () => {
    setLoading(true);
    try {
      const data = await api.getReviews(projectId, {
        status: statusFilter === 'all' ? undefined : statusFilter,
        limit: 200,
      });
      setReviews(data);
      if (data.length > 0 && !selectedReviewId) {
        setSelectedReviewId(data[0].id);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!projectId) return;
    api.getDatasets(projectId).then(setDatasets).catch(console.error);
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    loadReviews();
  }, [projectId, statusFilter]);

  const selectedReview = useMemo(
    () => reviews.find((r) => r.id === selectedReviewId) || null,
    [reviews, selectedReviewId]
  );

  const filteredReviews = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return reviews;
    return reviews.filter((r) => {
      const input = String(r.meta?.input_preview || '').toLowerCase();
      const output = String(r.meta?.output_preview || '').toLowerCase();
      return input.includes(q) || output.includes(q) || r.id.toLowerCase().includes(q);
    });
  }, [reviews, searchQuery]);

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'open':
        return 'warning';
      case 'in_review':
        return 'primary';
      case 'resolved':
        return 'success';
      case 'dismissed':
        return 'danger';
      default:
        return 'neutral';
    }
  };

  const updateStatus = async (status: ReviewItem['status']) => {
    if (!selectedReview) return;
    setActionError(null);
    try {
      const updated = await api.updateReview(selectedReview.id, { status });
      setReviews((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    } catch (e: any) {
      setActionError(e?.message || 'Failed to update status');
    }
  };

  const promoteToDataset = async () => {
    if (!selectedReview || !promotion.datasetId) return;
    setActionError(null);
    try {
      const updated = await api.promoteReviewToDataset(selectedReview.id, {
        dataset_id: promotion.datasetId,
        example_type: promotion.exampleType,
        corrected_expected: promotion.useCorrection
          ? { answer: promotion.correctedExpected }
          : undefined,
      });
      setReviews((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    } catch (e: any) {
      setActionError(e?.message || 'Failed to promote to dataset');
    }
  };

  const saveNotes = async () => {
    if (!selectedReview) return;
    setActionError(null);
    try {
      const updated = await api.updateReview(selectedReview.id, { notes: notesDraft });
      setReviews((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setEditingNotes(false);
    } catch (e: any) {
      setActionError(e?.message || 'Failed to save notes');
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-border-hairline shrink-0">
        <div className="px-6 py-4 space-y-4">
          <SectionHeader
            title="Review Queue"
            subtitle="Triage production traces, label failures, and promote to datasets."
            actions={
              <Button variant="secondary" size="sm" onClick={loadReviews}>
                Refresh
              </Button>
            }
          />

          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[240px]">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <Input
                type="text"
                placeholder="Search input or output..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Tabs
              options={STATUS_TABS}
              value={statusFilter}
              onChange={(value) => setStatusFilter(value as any)}
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-text-muted italic">Loading review queue...</div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Review list */}
          <div className="w-1/2 border-r border-border-hairline overflow-y-auto">
            {filteredReviews.length === 0 ? (
              <div className="py-20 text-center text-text-muted italic">No review items found.</div>
            ) : (
              <div className="p-4 space-y-3">
                {filteredReviews.map((review) => {
                  const isSelected = review.id === selectedReviewId;
                  return (
                    <button
                      key={review.id}
                      onClick={() => setSelectedReviewId(review.id)}
                      className={`w-full text-left p-4 rounded-lg border transition-all ${isSelected ? 'bg-primary/5 border-primary/20' : 'bg-panel border-border-base hover:border-border-hover'
                        }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <Badge variant={getStatusVariant(review.status)}>
                          {review.status.replace('_', ' ')}
                        </Badge>
                        <span className="text-[10px] text-text-muted uppercase tracking-wider">{review.source_type}</span>
                      </div>
                      <div className="mt-2 text-sm text-text-main font-medium line-clamp-2">
                        {review.meta?.input_preview || 'No input preview'}
                      </div>
                      <div className="text-[11px] text-text-muted mt-1 line-clamp-1">
                        Output: {review.meta?.output_preview || 'No output preview'}
                      </div>
                      <div className="mt-2 text-[10px] text-text-muted flex items-center gap-2">
                        <span>{new Date(review.created_at).toLocaleString()}</span>
                        <span className="opacity-40">|</span>
                        <span>Priority {review.priority}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: Review detail */}
          <div className="w-1/2 overflow-y-auto p-6">
            {!selectedReview ? (
              <div className="h-full flex items-center justify-center text-text-muted italic">
                Select a review item to see details.
              </div>
            ) : (
              <div className="space-y-6">
                <Card>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-text-muted uppercase tracking-wider">Review</div>
                      <div className="text-lg font-black text-text-main">{selectedReview.id}</div>
                    </div>
                    <Badge variant={getStatusVariant(selectedReview.status)}>
                      {selectedReview.status.replace('_', ' ')}
                    </Badge>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-text-muted">Source:</span>
                      <span className="ml-1 text-text-main font-medium">{selectedReview.source_type}</span>
                    </div>
                    <div>
                      <span className="text-text-muted">Priority:</span>
                      <span className="ml-1 text-text-main font-medium">{selectedReview.priority}</span>
                    </div>
                    <div>
                      <span className="text-text-muted">Model:</span>
                      <span className="ml-1 text-text-main font-medium">{selectedReview.meta?.model || 'n/a'}</span>
                    </div>
                    <div>
                      <span className="text-text-muted">Provider:</span>
                      <span className="ml-1 text-text-main font-medium">{selectedReview.meta?.provider || 'n/a'}</span>
                    </div>
                  </div>
                  {actionError && (
                    <div className="mt-4 text-xs text-rose-500 font-bold bg-rose-500/10 rounded-md p-3">
                      {actionError}
                    </div>
                  )}
                </Card>

                <Card>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[10px] uppercase tracking-wider text-text-muted font-bold">Input</div>
                    <button
                      onClick={() => setInputExpanded(!inputExpanded)}
                      className="text-xs text-text-muted hover:text-text-main flex items-center gap-1"
                    >
                      {inputExpanded ? <ChevronUpIcon className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />}
                      {inputExpanded ? 'Collapse' : 'Expand'}
                    </button>
                  </div>
                  <div className={`bg-app border border-border-base rounded-md p-3 text-sm text-text-main whitespace-pre-wrap transition-all ${inputExpanded ? 'max-h-64 overflow-y-auto' : 'max-h-20 overflow-hidden'}`}>
                    {selectedReview.meta?.input_preview || 'No input preview'}
                  </div>
                </Card>

                <Card>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[10px] uppercase tracking-wider text-text-muted font-bold">Output</div>
                    <button
                      onClick={() => setOutputExpanded(!outputExpanded)}
                      className="text-xs text-text-muted hover:text-text-main flex items-center gap-1"
                    >
                      {outputExpanded ? <ChevronUpIcon className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />}
                      {outputExpanded ? 'Collapse' : 'Expand'}
                    </button>
                  </div>
                  <div className={`bg-app border border-border-base rounded-md p-3 text-sm text-text-main whitespace-pre-wrap transition-all ${outputExpanded ? 'max-h-64 overflow-y-auto' : 'max-h-20 overflow-hidden'}`}>
                    {selectedReview.meta?.output_preview || 'No output preview'}
                  </div>
                </Card>

                <Card>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-text-muted font-bold">Status</div>
                      <div className="text-sm text-text-main">Update review state</div>
                    </div>
                    <Select
                      value={selectedReview.status}
                      onChange={(e) => updateStatus(e.target.value as ReviewItem['status'])}
                      className="text-xs"
                    >
                      <option value="open">Open</option>
                      <option value="in_review">In Review</option>
                      <option value="resolved">Resolved</option>
                      <option value="dismissed">Dismissed</option>
                    </Select>
                  </div>
                </Card>

                <Card>
                  <div className="flex items-center gap-2 mb-3">
                    <InboxArrowDownIcon className="w-4 h-4 text-emerald-500" />
                    <div className="text-sm font-bold text-text-main">Promote to Dataset</div>
                  </div>

                  {selectedReview.dataset_row_id ? (
                    <div className="text-xs text-emerald-500 font-bold bg-emerald-500/10 rounded-md p-3">
                      Promoted to dataset {selectedReview.dataset_id}
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-4 mb-3">
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-widest text-text-muted mb-2">
                            Dataset
                          </label>
                          <Select
                            value={promotion.datasetId}
                            onChange={(e) => setPromotion((p) => ({ ...p, datasetId: e.target.value }))}
                            className="text-sm"
                          >
                            <option value="">Select dataset...</option>
                            {datasets.map((ds) => (
                              <option key={ds.id} value={ds.id}>
                                {ds.name}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-widest text-text-muted mb-2">
                            Example Type
                          </label>
                          <Select
                            value={promotion.exampleType}
                            onChange={(e) =>
                              setPromotion((p) => ({ ...p, exampleType: e.target.value as 'gold' | 'anti_pattern' }))
                            }
                            className="text-sm"
                          >
                            <option value="gold">Gold</option>
                            <option value="anti_pattern">Anti-Pattern</option>
                          </Select>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 mb-3">
                        <input
                          type="checkbox"
                          checked={promotion.useCorrection}
                          onChange={(e) => setPromotion((p) => ({ ...p, useCorrection: e.target.checked }))}
                          className="w-4 h-4"
                        />
                        <span className="text-xs text-text-muted">Use corrected expected output</span>
                      </div>

                      {promotion.useCorrection && (
                        <Textarea
                          value={promotion.correctedExpected}
                          onChange={(e) => setPromotion((p) => ({ ...p, correctedExpected: e.target.value }))}
                          className="h-24 resize-none"
                          placeholder="Enter corrected expected output..."
                        />
                      )}

                      <div className="flex justify-end mt-4">
                        <Button
                          onClick={promoteToDataset}
                          disabled={!promotion.datasetId}
                          variant="success"
                        >
                          <ArrowUpRightIcon className="w-4 h-4" /> Promote
                        </Button>
                      </div>
                    </>
                  )}
                </Card>

                <Card>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <ExclamationTriangleIcon className="w-4 h-4 text-amber-500" />
                      <span className="text-sm font-bold text-text-main">Notes</span>
                    </div>
                    {!editingNotes && (
                      <button
                        onClick={() => {
                          setNotesDraft(selectedReview.notes || '');
                          setEditingNotes(true);
                        }}
                        className="text-xs text-primary hover:text-primary/80 font-semibold"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                  {editingNotes ? (
                    <div className="space-y-2">
                      <Textarea
                        value={notesDraft}
                        onChange={(e) => setNotesDraft(e.target.value)}
                        className="h-24 resize-none text-xs"
                        placeholder="Add notes about this review..."
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          onClick={() => setEditingNotes(false)}
                          variant="secondary"
                          size="sm"
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={saveNotes}
                          variant="primary"
                          size="sm"
                        >
                          Save Notes
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-text-muted whitespace-pre-wrap">
                      {selectedReview.notes || 'No notes - click Edit to add'}
                    </div>
                  )}
                </Card>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ReviewQueue;

