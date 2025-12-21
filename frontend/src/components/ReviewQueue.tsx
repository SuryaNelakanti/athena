import React, { useEffect, useMemo, useState } from 'react';
import {
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  InboxArrowDownIcon,
  ArrowUpRightIcon,
} from '@heroicons/react/24/outline';
import { api } from '../services/api';
import { Dataset, ReviewItem } from '../types';

interface ReviewQueueProps {
  projectId: string;
}

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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'open':
        return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case 'in_review':
        return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'resolved':
        return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      case 'dismissed':
        return 'bg-rose-500/10 text-rose-500 border-rose-500/20';
      default:
        return 'bg-text-muted/10 text-text-muted border-border-base';
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

  return (
    <div className="h-full flex flex-col bg-app transition-colors duration-300">
      {/* Header */}
      <div className="border-b border-border-base bg-panel shrink-0">
        <div className="px-8 py-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-serif font-black text-text-main">Review Queue</h2>
            <p className="text-xs text-text-muted mt-1">
              Triage production traces, label failures, and promote to datasets.
            </p>
          </div>
          <button
            onClick={loadReviews}
            className="px-4 py-2 bg-panel border border-border-base rounded-xl text-xs font-bold text-text-muted hover:text-text-main hover:bg-panel-hover"
          >
            Refresh
          </button>
        </div>

        <div className="px-8 pb-4 flex gap-4">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="text"
              placeholder="Search input or output..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-app border border-border-base rounded-xl pl-10 pr-4 py-2.5 text-sm text-text-main placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-wispr-purple/20 focus:border-wispr-purple/50"
            />
          </div>
          <div className="flex rounded-xl border border-border-base overflow-hidden">
            {['open', 'in_review', 'resolved', 'dismissed', 'all'].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s as any)}
                className={`px-4 py-2 text-xs font-bold ${
                  statusFilter === s ? 'bg-wispr-purple text-white' : 'bg-panel text-text-muted hover:bg-panel-hover'
                }`}
              >
                {s.replace('_', ' ').toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-text-muted italic">Loading review queue...</div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Review list */}
          <div className="w-1/2 border-r border-border-base bg-panel overflow-y-auto">
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
                      className={`w-full text-left p-4 rounded-2xl border transition-all ${
                        isSelected ? 'bg-wispr-purple/10 border-wispr-purple/30' : 'bg-panel border-border-base hover:border-border-hover'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getStatusBadge(review.status)}`}>
                          {review.status.replace('_', ' ')}
                        </span>
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
          <div className="w-1/2 overflow-y-auto bg-app p-6">
            {!selectedReview ? (
              <div className="h-full flex items-center justify-center text-text-muted italic">
                Select a review item to see details.
              </div>
            ) : (
              <div className="space-y-6">
                <div className="bg-panel border border-border-base rounded-2xl p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-text-muted uppercase tracking-wider">Review</div>
                      <div className="text-lg font-black text-text-main">{selectedReview.id}</div>
                    </div>
                    <span className={`px-2.5 py-1 rounded text-[10px] font-bold border ${getStatusBadge(selectedReview.status)}`}>
                      {selectedReview.status.replace('_', ' ')}
                    </span>
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
                    <div className="mt-4 text-xs text-rose-500 font-bold bg-rose-500/10 rounded-xl p-3">
                      {actionError}
                    </div>
                  )}
                </div>

                <div className="bg-panel border border-border-base rounded-2xl p-5">
                  <div className="text-[10px] uppercase tracking-wider text-text-muted font-bold mb-2">Input</div>
                  <div className="bg-app border border-border-base rounded-xl p-3 text-sm text-text-main whitespace-pre-wrap">
                    {selectedReview.meta?.input_preview || 'No input preview'}
                  </div>
                </div>

                <div className="bg-panel border border-border-base rounded-2xl p-5">
                  <div className="text-[10px] uppercase tracking-wider text-text-muted font-bold mb-2">Output</div>
                  <div className="bg-app border border-border-base rounded-xl p-3 text-sm text-text-main whitespace-pre-wrap">
                    {selectedReview.meta?.output_preview || 'No output preview'}
                  </div>
                </div>

                <div className="bg-panel border border-border-base rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-text-muted font-bold">Status</div>
                      <div className="text-sm text-text-main">Update review state</div>
                    </div>
                    <select
                      value={selectedReview.status}
                      onChange={(e) => updateStatus(e.target.value as ReviewItem['status'])}
                      className="bg-app border border-border-base rounded-xl px-3 py-2 text-xs text-text-main"
                    >
                      <option value="open">Open</option>
                      <option value="in_review">In Review</option>
                      <option value="resolved">Resolved</option>
                      <option value="dismissed">Dismissed</option>
                    </select>
                  </div>
                </div>

                <div className="bg-panel border border-border-base rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <InboxArrowDownIcon className="w-4 h-4 text-emerald-500" />
                    <div className="text-sm font-bold text-text-main">Promote to Dataset</div>
                  </div>

                  {selectedReview.dataset_row_id ? (
                    <div className="text-xs text-emerald-500 font-bold bg-emerald-500/10 rounded-xl p-3">
                      Promoted to dataset {selectedReview.dataset_id}
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-4 mb-3">
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-widest text-text-muted mb-2">
                            Dataset
                          </label>
                          <select
                            value={promotion.datasetId}
                            onChange={(e) => setPromotion((p) => ({ ...p, datasetId: e.target.value }))}
                            className="w-full bg-app border border-border-base rounded-xl px-4 py-2.5 text-sm text-text-main"
                          >
                            <option value="">Select dataset...</option>
                            {datasets.map((ds) => (
                              <option key={ds.id} value={ds.id}>
                                {ds.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-widest text-text-muted mb-2">
                            Example Type
                          </label>
                          <select
                            value={promotion.exampleType}
                            onChange={(e) =>
                              setPromotion((p) => ({ ...p, exampleType: e.target.value as 'gold' | 'anti_pattern' }))
                            }
                            className="w-full bg-app border border-border-base rounded-xl px-4 py-2.5 text-sm text-text-main"
                          >
                            <option value="gold">Gold</option>
                            <option value="anti_pattern">Anti-Pattern</option>
                          </select>
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
                        <textarea
                          value={promotion.correctedExpected}
                          onChange={(e) => setPromotion((p) => ({ ...p, correctedExpected: e.target.value }))}
                          className="w-full bg-app border border-border-base rounded-xl px-4 py-3 text-sm text-text-main h-24 resize-none"
                          placeholder="Enter corrected expected output..."
                        />
                      )}

                      <div className="flex justify-end mt-4">
                        <button
                          onClick={promoteToDataset}
                          disabled={!promotion.datasetId}
                          className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/20 hover:bg-emerald-600 disabled:opacity-50"
                        >
                          <ArrowUpRightIcon className="w-4 h-4" /> Promote
                        </button>
                      </div>
                    </>
                  )}
                </div>

                <div className="bg-panel border border-border-base rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <ExclamationTriangleIcon className="w-4 h-4 text-amber-500" />
                    <span className="text-sm font-bold text-text-main">Notes</span>
                  </div>
                  <div className="text-xs text-text-muted whitespace-pre-wrap">
                    {selectedReview.notes || 'No notes'}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ReviewQueue;
