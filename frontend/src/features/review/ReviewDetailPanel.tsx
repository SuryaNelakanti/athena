import React, { useEffect, useState } from 'react';
import { ArrowUpRightIcon, ChevronDownIcon, ChevronUpIcon, ExclamationTriangleIcon, InboxArrowDownIcon } from '@heroicons/react/24/outline';
import { api } from '../../lib/api';
import { getErrorMessage } from '../../lib/errors';
import type { Dataset, ReviewItem } from '../../types';
import { Badge, Button, Card, Select, Textarea } from '../../components/ui';
import { reviewStatusVariant } from './reviewStatus';

interface ReviewDetailPanelProps {
  review: ReviewItem | null;
  datasets: Dataset[];
  datasetsError: string | null;
  onReviewUpdated: (review: ReviewItem) => void;
}

interface PromotionDraft {
  datasetId: string;
  exampleType: 'gold' | 'anti_pattern';
  correctedExpected: string;
  useCorrection: boolean;
}

const INITIAL_PROMOTION: PromotionDraft = {
  datasetId: '',
  exampleType: 'gold',
  correctedExpected: '',
  useCorrection: false,
};

const ReviewDetailPanel: React.FC<ReviewDetailPanelProps> = ({
  review,
  datasets,
  datasetsError,
  onReviewUpdated,
}) => {
  const [actionError, setActionError] = useState<string | null>(null);
  const [promotion, setPromotion] = useState(INITIAL_PROMOTION);
  const [inputExpanded, setInputExpanded] = useState(true);
  const [outputExpanded, setOutputExpanded] = useState(true);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');

  useEffect(() => {
    setActionError(null);
    setEditingNotes(false);
    setNotesDraft('');
  }, [review?.id]);

  const updateStatus = async (status: ReviewItem['status']) => {
    if (!review) return;
    setActionError(null);
    try {
      const updated = await api.updateReview(review.id, { status });
      onReviewUpdated(updated);
    } catch (error: unknown) {
      setActionError(getErrorMessage(error, 'Failed to update status'));
    }
  };

  const promoteToDataset = async () => {
    if (!review || !promotion.datasetId) return;
    setActionError(null);
    try {
      const updated = await api.promoteReviewToDataset(review.id, {
        dataset_id: promotion.datasetId,
        example_type: promotion.exampleType,
        corrected_expected: promotion.useCorrection
          ? { answer: promotion.correctedExpected }
          : undefined,
      });
      onReviewUpdated(updated);
    } catch (error: unknown) {
      setActionError(getErrorMessage(error, 'Failed to promote to dataset'));
    }
  };

  const saveNotes = async () => {
    if (!review) return;
    setActionError(null);
    try {
      const updated = await api.updateReview(review.id, { notes: notesDraft });
      onReviewUpdated(updated);
      setEditingNotes(false);
    } catch (error: unknown) {
      setActionError(getErrorMessage(error, 'Failed to save notes'));
    }
  };

  if (!review) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted italic">
        Select a review item to see details.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-text-muted uppercase tracking-wider">Review</div>
            <div className="text-lg font-black text-text-main">{review.id}</div>
          </div>
          <Badge variant={reviewStatusVariant(review.status)}>{review.status.replace('_', ' ')}</Badge>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 text-xs">
          <MetadataValue label="Source" value={review.source_type} />
          <MetadataValue label="Priority" value={review.priority} />
          <MetadataValue label="Model" value={review.meta?.model || 'n/a'} />
          <MetadataValue label="Provider" value={review.meta?.provider || 'n/a'} />
        </div>
        {actionError && (
          <div role="alert" className="mt-4 text-xs text-rose-500 font-bold bg-rose-500/10 rounded-md p-3">
            {actionError}
          </div>
        )}
      </Card>

      <ExpandablePreview
        label="Input"
        value={review.meta?.input_preview || 'No input preview'}
        expanded={inputExpanded}
        onToggle={() => setInputExpanded((expanded) => !expanded)}
      />
      <ExpandablePreview
        label="Output"
        value={review.meta?.output_preview || 'No output preview'}
        expanded={outputExpanded}
        onToggle={() => setOutputExpanded((expanded) => !expanded)}
      />

      <Card>
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-text-muted font-bold">Status</div>
            <div className="text-sm text-text-main">Update review state</div>
          </div>
          <Select
            value={review.status}
            onChange={(event) => void updateStatus(event.target.value as ReviewItem['status'])}
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
        {review.dataset_row_id ? (
          <div className="text-xs text-emerald-500 font-bold bg-emerald-500/10 rounded-md p-3">
            Promoted to dataset {review.dataset_id}
          </div>
        ) : (
          <>
            {datasetsError && (
              <div role="alert" className="mb-3 rounded-md bg-rose-500/10 p-3 text-xs font-medium text-rose-500">
                {datasetsError}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4 mb-3">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-text-muted mb-2">Dataset</label>
                <Select
                  value={promotion.datasetId}
                  onChange={(event) => setPromotion((current) => ({ ...current, datasetId: event.target.value }))}
                  className="text-sm"
                >
                  <option value="">Select dataset...</option>
                  {datasets.map((dataset) => <option key={dataset.id} value={dataset.id}>{dataset.name}</option>)}
                </Select>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-text-muted mb-2">Example Type</label>
                <Select
                  value={promotion.exampleType}
                  onChange={(event) => setPromotion((current) => ({
                    ...current,
                    exampleType: event.target.value as PromotionDraft['exampleType'],
                  }))}
                  className="text-sm"
                >
                  <option value="gold">Gold</option>
                  <option value="anti_pattern">Anti-Pattern</option>
                </Select>
              </div>
            </div>

            <label className="flex items-center gap-3 mb-3">
              <input
                type="checkbox"
                checked={promotion.useCorrection}
                onChange={(event) => setPromotion((current) => ({ ...current, useCorrection: event.target.checked }))}
                className="w-4 h-4"
              />
              <span className="text-xs text-text-muted">Use corrected expected output</span>
            </label>

            {promotion.useCorrection && (
              <Textarea
                value={promotion.correctedExpected}
                onChange={(event) => setPromotion((current) => ({ ...current, correctedExpected: event.target.value }))}
                className="h-24 resize-none"
                placeholder="Enter corrected expected output..."
              />
            )}

            <div className="flex justify-end mt-4">
              <Button onClick={() => void promoteToDataset()} disabled={!promotion.datasetId} variant="success">
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
                setNotesDraft(review.notes || '');
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
              onChange={(event) => setNotesDraft(event.target.value)}
              className="h-24 resize-none text-xs"
              placeholder="Add notes about this review..."
            />
            <div className="flex justify-end gap-2">
              <Button onClick={() => setEditingNotes(false)} variant="secondary" size="sm">Cancel</Button>
              <Button onClick={() => void saveNotes()} variant="primary" size="sm">Save Notes</Button>
            </div>
          </div>
        ) : (
          <div className="text-xs text-text-muted whitespace-pre-wrap">
            {review.notes || 'No notes - click Edit to add'}
          </div>
        )}
      </Card>
    </div>
  );
};

const MetadataValue: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div>
    <span className="text-text-muted">{label}:</span>
    <span className="ml-1 text-text-main font-medium">{value}</span>
  </div>
);

const ExpandablePreview: React.FC<{
  label: string;
  value: string;
  expanded: boolean;
  onToggle: () => void;
}> = ({ label, value, expanded, onToggle }) => (
  <Card>
    <div className="flex items-center justify-between mb-2">
      <div className="text-[10px] uppercase tracking-wider text-text-muted font-bold">{label}</div>
      <button onClick={onToggle} className="text-xs text-text-muted hover:text-text-main flex items-center gap-1">
        {expanded ? <ChevronUpIcon className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />}
        {expanded ? 'Collapse' : 'Expand'}
      </button>
    </div>
    <div className={`bg-app border border-border-base rounded-md p-3 text-sm text-text-main whitespace-pre-wrap transition-all ${expanded ? 'max-h-64 overflow-y-auto' : 'max-h-20 overflow-hidden'}`}>
      {value}
    </div>
  </Card>
);

export default ReviewDetailPanel;
