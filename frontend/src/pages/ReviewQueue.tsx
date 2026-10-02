import { PageHeader } from '../layouts/PageHeader';
import { useProject } from '../contexts/ProjectContext';
import ReviewDetailPanel from '../features/review/ReviewDetailPanel';
import { ReviewQueueResults } from '../features/review/ReviewQueueResults';
import { ReviewQueueToolbar } from '../features/review/ReviewQueueToolbar';
import { useReviewQueue } from '../features/review/useReviewQueue';

const ReviewQueue = () => {
  const { currentProject } = useProject();
  const queue = useReviewQueue(currentProject?.id || '');

  return (
    <div className="h-full flex flex-col bg-app">
      <PageHeader
        title="Review Queue"
        subtitle="Triage production traces, label failures, and promote to datasets."
        className="pb-0 border-b-0"
      >
        <ReviewQueueToolbar
          searchQuery={queue.searchQuery}
          onSearchChange={queue.setSearchQuery}
          statusFilter={queue.statusFilter}
          onStatusChange={queue.setStatusFilter}
        />
      </PageHeader>

      {queue.loadError && (
        <div role="alert" className="mx-6 mt-4 rounded-md bg-rose-500/10 p-3 text-xs font-medium text-rose-500">
          {queue.loadError}
        </div>
      )}
      {queue.loading ? (
        <div className="py-20 text-center text-text-muted italic">Loading review queue...</div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          <div className="w-1/2 border-r border-border-hairline overflow-y-auto">
            <ReviewQueueResults
              reviews={queue.filteredReviews}
              selectedReviewId={queue.selectedReviewId}
              onSelectReview={queue.setSelectedReviewId}
            />
          </div>
          <div className="w-1/2 overflow-y-auto p-6">
            <ReviewDetailPanel
              review={queue.selectedReview}
              datasets={queue.datasets}
              datasetsError={queue.datasetsError}
              onReviewUpdated={(updated) => {
                queue.setReviews((current) => current.map((item) => item.id === updated.id ? updated : item));
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ReviewQueue;
