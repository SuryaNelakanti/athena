import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { Input, Tabs } from '../../components/ui';
import {
  isReviewStatusFilter,
  REVIEW_STATUS_TABS,
  type ReviewStatusFilter,
} from './useReviewQueue';

type ReviewQueueToolbarProps = {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  statusFilter: ReviewStatusFilter;
  onStatusChange: (status: ReviewStatusFilter) => void;
};

export function ReviewQueueToolbar({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusChange,
}: ReviewQueueToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-4 pb-4 px-6">
      <div className="relative flex-1 min-w-[240px]">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <Input
          type="text"
          placeholder="Search input or output..."
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          className="pl-9"
        />
      </div>
      <Tabs
        options={REVIEW_STATUS_TABS}
        value={statusFilter}
        onChange={(value) => {
          if (isReviewStatusFilter(value)) onStatusChange(value);
        }}
      />
    </div>
  );
}
