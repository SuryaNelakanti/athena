import { Button } from '../../components/ui';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { FIELD_LABELS, QUICK_FILTERS } from './filterConfig';
import type { Filter } from './filterConfig';

type ActiveLogFiltersProps = {
  filters: Filter[];
  onQuickFilter: (field: string, operator: string, value: string) => void;
  onRemove: (filterId: string) => void;
  onClear: () => void;
};

export function ActiveLogFilters({
  filters,
  onQuickFilter,
  onRemove,
  onClear,
}: ActiveLogFiltersProps) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-[10px] uppercase tracking-widest text-text-muted font-bold">
          Quick Filters
        </span>
        {QUICK_FILTERS.map((filter) => {
          const active = filters.some((item) => (
            item.field === filter.field && item.op === filter.op && item.value === filter.value
          ));
          return (
            <Button
              key={filter.label}
              onClick={() => onQuickFilter(filter.field, filter.op, filter.value)}
              size="sm"
              variant="outline"
              className={`rounded-full text-[11px] ${active ? 'bg-primary/10 text-primary border-primary/40' : ''}`}
              aria-pressed={active}
            >
              {filter.label}
            </Button>
          );
        })}
        {filters.length > 0 && (
          <Button
            onClick={onClear}
            variant="ghost"
            size="sm"
            className="text-[10px] font-bold uppercase tracking-wider text-rose-500 hover:text-rose-600"
          >
            Clear All
          </Button>
        )}
      </div>

      {filters.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {filters.map((filter) => (
            <div
              key={filter.id}
              className="flex items-center gap-2 px-3 py-1.5 bg-panel border border-border-base rounded-md text-xs text-text-main"
            >
              <span className="font-semibold">{FIELD_LABELS[filter.field] || filter.field}</span>
              <span className="text-text-muted">{filter.op}</span>
              <span className="text-text-muted">{filter.value}</span>
              <button
                onClick={() => onRemove(filter.id)}
                className="text-text-muted hover:text-rose-500"
                aria-label={`Remove filter ${FIELD_LABELS[filter.field] || filter.field} ${filter.op} ${filter.value}`}
              >
                <XMarkIcon className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
