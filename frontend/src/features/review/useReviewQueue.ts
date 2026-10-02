import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { getErrorMessage } from '../../lib/errors';
import type { Dataset, ReviewItem } from '../../types';

export type ReviewStatusFilter = 'all' | 'open' | 'in_review' | 'resolved' | 'dismissed';

export const REVIEW_STATUS_TABS: Array<{ id: ReviewStatusFilter; label: string }> = [
  { id: 'open', label: 'Open' },
  { id: 'in_review', label: 'In Review' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'dismissed', label: 'Dismissed' },
  { id: 'all', label: 'All' },
];

const STATUS_FILTERS: ReviewStatusFilter[] = ['all', 'open', 'in_review', 'resolved', 'dismissed'];

export const isReviewStatusFilter = (value: string): value is ReviewStatusFilter =>
  STATUS_FILTERS.some((status) => status === value);

export function useReviewQueue(projectId: string) {
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [datasetsError, setDatasetsError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ReviewStatusFilter>('open');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setDatasetsError(null);
    if (!projectId) {
      setDatasets([]);
      return () => {
        active = false;
      };
    }

    api.getDatasets(projectId)
      .then((items) => {
        if (active) setDatasets(items);
      })
      .catch((error: unknown) => {
        if (active) setDatasetsError(getErrorMessage(error, 'Failed to load datasets.'));
      });
    return () => {
      active = false;
    };
  }, [projectId]);

  useEffect(() => {
    let active = true;
    setReviews([]);
    setSelectedReviewId(null);
    setLoading(Boolean(projectId));
    setLoadError(null);
    if (!projectId) {
      setLoading(false);
      return () => {
        active = false;
      };
    }

    api.getReviews(projectId, {
      status: statusFilter === 'all' ? undefined : statusFilter,
      limit: 200,
    })
      .then((items) => {
        if (!active) return;
        setReviews(items);
        setSelectedReviewId(items[0]?.id ?? null);
      })
      .catch((error: unknown) => {
        if (active) setLoadError(getErrorMessage(error, 'Failed to load reviews.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [projectId, statusFilter]);

  const selectedReview = useMemo(
    () => reviews.find((review) => review.id === selectedReviewId) ?? null,
    [reviews, selectedReviewId],
  );
  const filteredReviews = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return reviews;
    return reviews.filter((review) => {
      const input = String(review.meta?.input_preview || '').toLowerCase();
      const output = String(review.meta?.output_preview || '').toLowerCase();
      return input.includes(query) || output.includes(query) || review.id.toLowerCase().includes(query);
    });
  }, [reviews, searchQuery]);

  return {
    reviews,
    setReviews,
    datasets,
    loading,
    loadError,
    datasetsError,
    statusFilter,
    setStatusFilter,
    searchQuery,
    setSearchQuery,
    selectedReview,
    selectedReviewId,
    setSelectedReviewId,
    filteredReviews,
  };
}
