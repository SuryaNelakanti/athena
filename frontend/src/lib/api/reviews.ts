import { API_BASE_URL, requestJson } from './base';
import type {
    ReviewCreateInput,
    ReviewFromTraceInput,
    ReviewItem,
    ReviewPromoteInput,
    ReviewUpdateInput,
} from '../../types';

export const reviewsApi = {
    // Review queue
    getReviews: async (
        projectId: string,
        filters?: { status?: string; source_type?: string; limit?: number; offset?: number }
    ): Promise<ReviewItem[]> => {
        const params = new URLSearchParams({ project_id: projectId });
        if (filters?.status) params.append('status', filters.status);
        if (filters?.source_type) params.append('source_type', filters.source_type);
        if (filters?.limit !== undefined) params.append('limit', filters.limit.toString());
        if (filters?.offset !== undefined) params.append('offset', filters.offset.toString());
        return requestJson<ReviewItem[]>(`${API_BASE_URL}/reviews?${params.toString()}`, 'Failed to fetch reviews');
    },

    createReviewFromTrace: async (payload: ReviewFromTraceInput): Promise<ReviewItem> => {
        return requestJson<ReviewItem>(`${API_BASE_URL}/reviews/from-trace`, 'Failed to create review from trace', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    },

    createReview: async (payload: ReviewCreateInput): Promise<ReviewItem> => {
        return requestJson<ReviewItem>(`${API_BASE_URL}/reviews`, 'Failed to create review', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    },

    updateReview: async (reviewId: string, payload: ReviewUpdateInput): Promise<ReviewItem> => {
        return requestJson<ReviewItem>(`${API_BASE_URL}/reviews/${reviewId}`, 'Failed to update review', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    },

    promoteReviewToDataset: async (reviewId: string, payload: ReviewPromoteInput): Promise<ReviewItem> => {
        return requestJson<ReviewItem>(`${API_BASE_URL}/reviews/${reviewId}/promote`, 'Failed to promote review to dataset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    },
};
