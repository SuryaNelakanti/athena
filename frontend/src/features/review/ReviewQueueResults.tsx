import {
  ArrowUpRightIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { Badge } from '../../components/ui';
import type { ReviewItem } from '../../types';
import { reviewStatusVariant } from './reviewStatus';

type ReviewQueueResultsProps = {
  reviews: ReviewItem[];
  selectedReviewId: string | null;
  onSelectReview: (reviewId: string) => void;
};

function statusTone(status: string): string {
  switch (status) {
    case 'open':
      return 'amber';
    case 'in_review':
      return 'sky';
    case 'resolved':
      return 'mint';
    case 'dismissed':
      return 'rose';
    default:
      return 'slate';
  }
}

function statusIcon(status: string) {
  switch (status) {
    case 'open':
      return <ExclamationTriangleIcon className="w-4 h-4" />;
    case 'in_review':
      return <MagnifyingGlassIcon className="w-4 h-4" />;
    case 'resolved':
      return <CheckCircleIcon className="w-4 h-4" />;
    case 'dismissed':
      return <XMarkIcon className="w-4 h-4" />;
    default:
      return <ArrowUpRightIcon className="w-4 h-4" />;
  }
}

export function ReviewQueueResults({
  reviews,
  selectedReviewId,
  onSelectReview,
}: ReviewQueueResultsProps) {
  if (reviews.length === 0) {
    return <div className="py-20 text-center text-text-muted italic">No review items found.</div>;
  }

  return (
    <div className="p-4 space-y-3">
      {reviews.map((review) => {
        const isSelected = review.id === selectedReviewId;
        const tone = statusTone(review.status);
        return (
          <button
            key={review.id}
            onClick={() => onSelectReview(review.id)}
            className={`w-full text-left p-4 rounded-lg border transition-all ${isSelected ? 'bg-primary/5 border-primary/20' : 'bg-panel border-border-base hover:border-border-hover'
              }`}
          >
            <div className="flex items-start gap-3">
              <span className={`icon-chip icon-chip--${tone} ${isSelected ? 'icon-chip--active' : ''}`}>
                {statusIcon(review.status)}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-3">
                  <Badge variant={reviewStatusVariant(review.status)}>
                    {review.status.replace('_', ' ')}
                  </Badge>
                  <span className="text-[10px] text-text-muted uppercase tracking-wider">
                    {review.source_type}
                  </span>
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
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
