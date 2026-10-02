import { useId, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { FunnelIcon } from '@heroicons/react/24/outline';

import { Button, Select } from '../../components/ui';
import type { Log } from '../../types';
import type { View } from '../../lib/api';
import { ActiveLogFilters } from './ActiveLogFilters';
import {
  EVENT_TYPE_PRESETS,
  TIME_RANGES,
  makeId,
  normalizeViewFilters,
} from './filterConfig';
import type { Filter } from './filterConfig';
import { LogFilterEditor } from './LogFilterEditor';
import { SavedLogViewsMenu } from './SavedLogViewsMenu';
import { useSavedLogViews } from './useSavedLogViews';

interface LogFilterToolbarProps {
  projectId: string;
  logs: Log[];
  filters: Filter[];
  setFilters: Dispatch<SetStateAction<Filter[]>>;
  logError: string | null;
  onRefreshLogs: () => void;
}

export function LogFilterToolbar({
  projectId,
  logs,
  filters,
  setFilters,
  logError,
  onRefreshLogs,
}: LogFilterToolbarProps) {
  const addFilterPanelId = useId();
  const [timeRange, setTimeRange] = useState('all');
  const [showAddFilter, setShowAddFilter] = useState(false);
  const [viewApplicationError, setViewApplicationError] = useState<string | null>(null);
  const { views, viewsError, saveView, deleteView } = useSavedLogViews(projectId);

  const statusValue = filters.find((filter) => (
    filter.field === 'status' && filter.op === '='
  ))?.value || 'all';
  const eventTypeValue = filters.find((filter) => (
    filter.field === 'event_type' && filter.op === '='
  ))?.value || 'all';
  const eventTypeOptions = useMemo(() => {
    const types = new Set(EVENT_TYPE_PRESETS);
    logs.forEach((log) => {
      if (log.event_type) types.add(log.event_type);
    });
    if (eventTypeValue !== 'all') types.add(eventTypeValue);
    return ['all', ...Array.from(types)];
  }, [eventTypeValue, logs]);

  const activeFilters = filters.filter((filter) => filter.value.trim());
  const activeFilterFields = new Set(activeFilters.map((filter) => filter.field));

  const upsertFilter = (field: string, op: string, value: string) => {
    setFilters((currentFilters) => {
      const nextFilters = [...currentFilters];
      const index = nextFilters.findIndex((filter) => (
        filter.field === field && filter.op === op
      ));
      if (!value.trim()) {
        if (index >= 0) nextFilters.splice(index, 1);
        return nextFilters;
      }
      if (index >= 0) {
        nextFilters[index] = { ...nextFilters[index], value };
      } else {
        nextFilters.push({ id: makeId(), field, op, value });
      }
      return nextFilters;
    });
  };

  const removeFilter = (id: string) => {
    const removedFilter = filters.find((filter) => filter.id === id);
    if (removedFilter?.field === 'timestamp' && removedFilter.op === '>=') {
      setTimeRange('all');
    }
    setFilters((currentFilters) => currentFilters.filter((filter) => filter.id !== id));
  };

  const handleTimeRangeChange = (range: string) => {
    setTimeRange(range);
    if (range === 'custom') return;
    const selectedRange = TIME_RANGES.find((item) => item.value === range);
    if (!selectedRange || selectedRange.ms === null) {
      upsertFilter('timestamp', '>=', '');
      return;
    }
    upsertFilter('timestamp', '>=', String(Date.now() - selectedRange.ms));
  };

  const applyView = (view: View) => {
    const config = view.config || {};
    const hasFilters = Array.isArray(config.filters) && config.filters.length > 0;
    if (!hasFilters && config.query) {
      setViewApplicationError('This view uses AQL and cannot be applied without filters.');
      return;
    }

    setViewApplicationError(null);
    if (config.filters) {
      const normalizedFilters = normalizeViewFilters(config.filters);
      setFilters(normalizedFilters);
      const hasTimeFilter = normalizedFilters.some((filter) => (
        filter.field === 'timestamp' && filter.op === '>='
      ));
      setTimeRange(hasTimeFilter ? 'custom' : 'all');
    } else {
      if (config.level) {
        const status = config.level.toUpperCase() === 'ERROR' ? 'error' : 'success';
        upsertFilter('status', '=', status);
      }
      if (config.search) upsertFilter('message', 'contains', config.search);
    }
  };

  const clearFilters = () => {
    setFilters([]);
    setTimeRange('all');
  };

  return (
    <div className="px-6 py-3 border-b border-border-hairline flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Select
          className="text-[11px] font-semibold uppercase tracking-wide"
          value={statusValue}
          onChange={(event) => upsertFilter(
            'status',
            '=',
            event.target.value === 'all' ? '' : event.target.value.toLowerCase(),
          )}
        >
          <option value="all">Status: All</option>
          <option value="success">Success</option>
          <option value="error">Error</option>
        </Select>

        <Select
          className="text-[11px] font-semibold uppercase tracking-wide"
          value={eventTypeValue}
          onChange={(event) => upsertFilter(
            'event_type',
            '=',
            event.target.value === 'all' ? '' : event.target.value,
          )}
        >
          {eventTypeOptions.map((eventType) => (
            <option key={eventType} value={eventType}>
              {eventType === 'all' ? 'Type: All' : eventType.replace(/_/g, ' ')}
            </option>
          ))}
        </Select>

        <Select
          className="text-[11px] font-semibold uppercase tracking-wide"
          value={timeRange}
          onChange={(event) => handleTimeRangeChange(event.target.value)}
        >
          {TIME_RANGES.map((range) => (
            <option key={range.value} value={range.value}>{range.label}</option>
          ))}
        </Select>

        <Button
          onClick={() => setShowAddFilter((visible) => !visible)}
          size="sm"
          variant="outline"
          className={`text-xs ${showAddFilter ? 'bg-primary/10 text-primary border-primary/40' : ''}`}
          aria-expanded={showAddFilter}
          aria-controls={addFilterPanelId}
        >
          <FunnelIcon className="w-3.5 h-3.5" />
          Filters
        </Button>

        <SavedLogViewsMenu
          views={views}
          viewsError={viewsError}
          filters={filters}
          onApply={applyView}
          saveView={saveView}
          deleteView={deleteView}
        />

        <Button onClick={onRefreshLogs} size="sm" variant="secondary" className="text-xs">
          Refresh
        </Button>
      </div>

      <ActiveLogFilters
        filters={activeFilters}
        onQuickFilter={upsertFilter}
        onRemove={removeFilter}
        onClear={clearFilters}
      />

      <LogFilterEditor
        open={showAddFilter}
        panelId={addFilterPanelId}
        activeFilterFields={activeFilterFields}
        onAdd={upsertFilter}
        onClose={() => setShowAddFilter(false)}
      />

      {(logError || viewApplicationError) && (
        <div className="text-xs text-rose-500 font-bold bg-rose-500/10 rounded-md p-3" role="alert">
          {logError || viewApplicationError}
        </div>
      )}
      {viewsError && (
        <div className="text-xs text-rose-500 font-bold bg-rose-500/10 rounded-md p-3" role="alert">
          {viewsError}
        </div>
      )}
    </div>
  );
}
