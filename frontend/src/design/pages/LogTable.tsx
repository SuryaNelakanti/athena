import React, { useEffect, useMemo, useState } from 'react';
import { Log, AqlQueryResponse, AqlBuilder } from '../../types';
import {
  CpuChipIcon,
  BookmarkIcon,
  XMarkIcon,
  ArrowTopRightOnSquareIcon,
  AtSymbolIcon,
  LinkIcon,
  FunnelIcon,
  PlusIcon,
  UserPlusIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';
import { api, View } from '../../services/api';
import { Badge, Button, IconButton, Input, Modal, Select, Textarea } from '../ui';

interface LogTableProps {
  projectId: string;
  onSelectLog: (log: Log) => void;
  onOpenTrace?: (traceId: string) => void;
  selectedLogId: string | null;
}

type Filter = {
  id: string;
  field: string;
  op: string;
  value: string;
};

type CollabKind = 'assignment' | 'mention' | 'share';
type CollabTarget = 'log' | 'trace';

type CollabAction = {
  kind: CollabKind;
  objectType: CollabTarget;
  objectId: string;
  logId: string;
  traceId?: string | null;
};

const RESULT_LIMIT = 200;

const FIELD_TYPES: Record<string, 'string' | 'number'> = {
  id: 'string',
  trace_id: 'string',
  span_id: 'string',
  status: 'string',
  event_type: 'string',
  message: 'string',
  model: 'string',
  provider: 'string',
  timestamp: 'number',
  latency_ms: 'number',
  prompt_tokens: 'number',
  completion_tokens: 'number',
  total_tokens: 'number',
  cost: 'number',
  created_at: 'number',
};

const FIELD_LABELS: Record<string, string> = {
  status: 'Status',
  event_type: 'Event Type',
  message: 'Message',
  model: 'Model',
  provider: 'Provider',
  trace_id: 'Trace ID',
  span_id: 'Span ID',
  latency_ms: 'Latency (ms)',
  total_tokens: 'Total Tokens',
  cost: 'Cost',
  timestamp: 'Timestamp (ms)',
  prompt_tokens: 'Prompt Tokens',
  completion_tokens: 'Completion Tokens',
  created_at: 'Created At (ms)',
};

const OP_BY_TYPE: Record<'string' | 'number', string[]> = {
  string: ['=', '!=', 'contains', 'in'],
  number: ['=', '!=', '>', '>=', '<', '<='],
};

const FILTER_FIELDS = [
  'status',
  'event_type',
  'message',
  'model',
  'provider',
  'trace_id',
  'span_id',
  'latency_ms',
  'total_tokens',
  'cost',
  'timestamp',
  'prompt_tokens',
  'completion_tokens',
  'created_at',
];

const QUICK_FILTERS = [
  { label: 'Errors', field: 'status', op: '=', value: 'error' },
  { label: 'Compliance', field: 'event_type', op: '=', value: 'compliance' },
  { label: 'Guardrails', field: 'event_type', op: '=', value: 'guardrail' },
  { label: 'Alerts', field: 'event_type', op: '=', value: 'alert' },
  { label: 'Slow > 1500ms', field: 'latency_ms', op: '>', value: '1500' },
  { label: 'Cost > $0.01', field: 'cost', op: '>', value: '0.01' },
  { label: 'Tokens > 2k', field: 'total_tokens', op: '>', value: '2000' },
];

const TIME_RANGES = [
  { label: 'All Time', value: 'all', ms: null },
  { label: 'Last 1h', value: '1h', ms: 60 * 60 * 1000 },
  { label: 'Last 24h', value: '24h', ms: 24 * 60 * 60 * 1000 },
  { label: 'Last 7d', value: '7d', ms: 7 * 24 * 60 * 60 * 1000 },
  { label: 'Custom', value: 'custom', ms: null },
];

const EVENT_TYPE_PRESETS = [
  'llm_call',
  'llm_stream',
  'compliance',
  'guardrail',
  'audit',
  'alert',
  'custom',
];

const makeId = () => `f_${Math.random().toString(36).slice(2, 9)}`;
const normalizeViewFilters = (filters: Filter[]) => {
  return filters.flatMap((filter) => {
    if (filter.field === 'level' && filter.op === '=') {
      const status = filter.value?.toUpperCase() === 'ERROR' ? 'error' : 'success';
      return [{ ...filter, field: 'status', value: status }];
    }
    return [filter];
  });
};

const LogTable: React.FC<LogTableProps> = ({
  projectId,
  onSelectLog,
  onOpenTrace,
  selectedLogId,
}) => {
  const [logs, setLogs] = useState<Log[]>([]);
  const [aqlResult, setAqlResult] = useState<AqlQueryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<Filter[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [timeRange, setTimeRange] = useState('all');
  const [showAddFilter, setShowAddFilter] = useState(false);
  const [showAql, setShowAql] = useState(false);
  const [queryMode, setQueryMode] = useState<'builder' | 'aql'>('builder');
  const [aqlQuery, setAqlQuery] = useState('');
  const [aqlPreview, setAqlPreview] = useState('');

  const [views, setViews] = useState<View[]>([]);
  const [showSaveView, setShowSaveView] = useState(false);
  const [newViewName, setNewViewName] = useState('');
  const [showViewsList, setShowViewsList] = useState(false);

  const [collabAction, setCollabAction] = useState<CollabAction | null>(null);
  const [collabAssignee, setCollabAssignee] = useState('');
  const [collabMention, setCollabMention] = useState('');
  const [collabNote, setCollabNote] = useState('');
  const [shareExpiry, setShareExpiry] = useState('');
  const [collabError, setCollabError] = useState<string | null>(null);
  const [collabMessage, setCollabMessage] = useState<string | null>(null);
  const [collabBusy, setCollabBusy] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);

  const [newFilter, setNewFilter] = useState({
    field: FILTER_FIELDS[0],
    op: OP_BY_TYPE[FIELD_TYPES[FILTER_FIELDS[0]] || 'string'][0],
    value: '',
  });

  const statusValue = useMemo(() => {
    const statusFilter = filters.find((f) => f.field === 'status' && f.op === '=');
    return statusFilter?.value || 'all';
  }, [filters]);

  const eventTypeValue = useMemo(() => {
    const eventFilter = filters.find((f) => f.field === 'event_type' && f.op === '=');
    return eventFilter?.value || 'all';
  }, [filters]);

  const eventTypeOptions = useMemo(() => {
    const types = new Set(EVENT_TYPE_PRESETS);
    logs.forEach((log) => {
      if (log.event_type) {
        types.add(log.event_type);
      }
    });
    if (eventTypeValue && eventTypeValue !== 'all') {
      types.add(eventTypeValue);
    }
    return ['all', ...Array.from(types)];
  }, [logs, eventTypeValue]);

  useEffect(() => {
    if (!projectId) return;
    loadViews();
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    if (queryMode === 'builder') {
      loadLogs();
    }
  }, [projectId, filters, queryMode]);

  const loadViews = async () => {
    try {
      const vs = await api.getViews(projectId);
      setViews(vs.filter(v => (v.entity_type || v.config?.entity_type) === 'logs' || !v.entity_type));
    } catch (e) {
      console.error("Failed to load views", e);
    }
  };

  const buildAqlBuilderPayload = (): AqlBuilder => {
    const selectFields = [
      'id',
      'project_id',
      'trace_id',
      'span_id',
      'status',
      'event_type',
      'message',
      'timestamp',
      'latency_ms',
      'prompt_tokens',
      'completion_tokens',
      'total_tokens',
      'cost',
      'model',
      'provider',
      'attributes',
      'log_metadata',
      'created_at',
    ];
    return {
      shape: 'project_logs',
      params: { project_id: projectId },
      select: selectFields,
      filters: filters
        .filter((f) => f.value.trim())
        .map((f) => ({
          field: f.field,
          op: f.op,
          value: f.value,
        })),
      sort: { field: 'timestamp', direction: 'desc' },
      limit: RESULT_LIMIT,
    };
  };

  const loadLogs = async (overrideQuery?: string) => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const data = overrideQuery
        ? await api.runAqlQuery(overrideQuery)
        : await api.runAqlQuery({ builder: buildAqlBuilderPayload() });
      setAqlResult(data);
      if (data.query) {
        setAqlPreview(data.query);
        if (queryMode === 'builder') {
          setAqlQuery(data.query);
        }
      }
      if (data.shape === 'project_logs') {
        const rows = (data.data || []).map((row) => ({
          id: row.id,
          project_id: row.project_id || projectId,
          trace_id: row.trace_id,
          span_id: row.span_id,
          level: row.level,
          status: row.status || (row.level === 'ERROR' ? 'error' : row.level ? 'success' : undefined),
          event_type: row.event_type,
          message: row.message,
          timestamp: row.timestamp,
          latency_ms: row.latency_ms,
          prompt_tokens: row.prompt_tokens,
          completion_tokens: row.completion_tokens,
          total_tokens: row.total_tokens,
          cost: row.cost,
          model: row.model,
          provider: row.provider,
          attributes: row.attributes || {},
          log_metadata: row.log_metadata || {},
          created_at: row.created_at || row.timestamp,
        })) as Log[];
        setLogs(rows);
      } else {
        setLogs([]);
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load logs');
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  const upsertFilter = (field: string, op: string, value: string) => {
    setQueryMode('builder');
    setFilters((prev) => {
      const next = [...prev];
      const idx = next.findIndex((f) => f.field === field && f.op === op);
      if (!value.trim()) {
        if (idx >= 0) next.splice(idx, 1);
        return next;
      }
      if (idx >= 0) {
        next[idx] = { ...next[idx], value };
      } else {
        next.push({ id: makeId(), field, op, value });
      }
      return next;
    });
  };

  const removeFilter = (id: string) => {
    setFilters((prev) => {
      const removed = prev.find((f) => f.id === id);
      if (removed && removed.field === 'timestamp' && removed.op === '>=') {
        setTimeRange('all');
      }
      return prev.filter((f) => f.id !== id);
    });
  };

  const clearFilters = () => {
    setFilters([]);
    setSearchInput('');
    setTimeRange('all');
  };

  const handleSearch = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      upsertFilter('message', 'contains', searchInput);
    }
  };

  const handleStatusChange = (status: string) => {
    if (status === 'all') {
      upsertFilter('status', '=', '');
      return;
    }
    upsertFilter('status', '=', status.toLowerCase());
  };

  const handleEventTypeChange = (eventType: string) => {
    if (eventType === 'all') {
      upsertFilter('event_type', '=', '');
      return;
    }
    upsertFilter('event_type', '=', eventType);
  };

  const handleTimeRangeChange = (range: string) => {
    setTimeRange(range);
    if (range === 'custom') return;
    const selected = TIME_RANGES.find(r => r.value === range);
    if (!selected || selected.ms === null) {
      upsertFilter('timestamp', '>=', '');
      return;
    }
    const since = Date.now() - selected.ms;
    upsertFilter('timestamp', '>=', String(since));
  };

  const handleAddFilter = () => {
    upsertFilter(newFilter.field, newFilter.op, newFilter.value);
    setNewFilter((prev) => ({ ...prev, value: '' }));
    setShowAddFilter(false);
  };

  const applyQuickFilter = (filter: { field: string; op: string; value: string }) => {
    upsertFilter(filter.field, filter.op, filter.value);
  };

  const runAql = async () => {
    if (!aqlQuery.trim()) {
      setError('AQL query is empty');
      return;
    }
    setQueryMode('aql');
    await loadLogs(aqlQuery);
  };

  const applyView = (view: View) => {
    const cfg = view.config || {};
    if (cfg.mode === 'aql' && cfg.query) {
      setQueryMode('aql');
      setAqlQuery(cfg.query);
      setShowAql(true);
      const normalizedFilters = normalizeViewFilters(cfg.filters || []);
      setFilters(normalizedFilters);
      const searchFilter = normalizedFilters.find((f: Filter) => f.field === 'message' && f.op === 'contains');
      setSearchInput(searchFilter?.value || '');
      const timeFilter = normalizedFilters.find((f: Filter) => f.field === 'timestamp' && f.op === '>=');
      setTimeRange(timeFilter ? 'custom' : 'all');
      loadLogs(cfg.query);
    } else if (cfg.filters) {
      setQueryMode('builder');
      setShowAql(false);
      const normalizedFilters = normalizeViewFilters(cfg.filters || []);
      setFilters(normalizedFilters);
      const searchFilter = normalizedFilters.find((f: Filter) => f.field === 'message' && f.op === 'contains');
      setSearchInput(searchFilter?.value || '');
      const timeFilter = normalizedFilters.find((f: Filter) => f.field === 'timestamp' && f.op === '>=');
      setTimeRange(timeFilter ? 'custom' : 'all');
    } else {
      setQueryMode('builder');
      setShowAql(false);
      if (cfg.level) {
        const status = cfg.level.toUpperCase() === 'ERROR' ? 'error' : 'success';
        upsertFilter('status', '=', status);
      }
      if (cfg.search) upsertFilter('message', 'contains', cfg.search);
      setSearchInput(cfg.search || '');
    }
    setShowViewsList(false);
  };

  const handleSaveView = async () => {
    if (!newViewName.trim()) return;
    try {
      await api.createView({
        project_id: projectId,
        name: newViewName,
        entity_type: 'logs',
        config: {
          entity_type: 'logs',
          mode: queryMode,
          query: queryMode === 'aql' ? aqlQuery : (aqlPreview || aqlQuery),
          filters,
        },
      });
      setNewViewName('');
      setShowSaveView(false);
      loadViews();
    } catch (e) {
      console.error("Failed to save view", e);
    }
  };

  const handleDeleteView = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm('Delete this view?')) {
      await api.deleteView(id);
      loadViews();
    }
  };

  const openCollab = (kind: CollabKind, log: Log) => {
    setCollabAction({
      kind,
      objectType: 'log',
      objectId: log.id,
      logId: log.id,
      traceId: log.trace_id,
    });
    setCollabAssignee('');
    setCollabMention('');
    setCollabNote('');
    setShareExpiry('');
    setShareToken(null);
    setCollabError(null);
    setCollabMessage(null);
  };

  const closeCollab = () => {
    setCollabAction(null);
    setCollabError(null);
    setCollabMessage(null);
    setCollabBusy(false);
    setShareToken(null);
  };

  const handleCollabSubmit = async () => {
    if (!collabAction) return;
    setCollabError(null);
    setCollabMessage(null);
    setCollabBusy(true);
    try {
      if (collabAction.kind === 'assignment') {
        if (!collabAssignee.trim()) {
          setCollabError('Assignee is required.');
          return;
        }
        await api.createAssignment({
          project_id: projectId,
          object_type: collabAction.objectType,
          object_id: collabAction.objectId,
          assignee: collabAssignee.trim(),
          note: collabNote.trim() || undefined,
        });
        setCollabMessage('Assignment created.');
      }
      if (collabAction.kind === 'mention') {
        if (!collabMention.trim()) {
          setCollabError('Mention target is required.');
          return;
        }
        await api.createMention({
          project_id: projectId,
          object_type: collabAction.objectType,
          object_id: collabAction.objectId,
          mentioned: collabMention.trim(),
          note: collabNote.trim() || undefined,
        });
        setCollabMessage('Mention created.');
      }
      if (collabAction.kind === 'share') {
        const expiresAt = shareExpiry ? new Date(shareExpiry).getTime() : undefined;
        const created = await api.createShareLink({
          project_id: projectId,
          object_type: collabAction.objectType,
          object_id: collabAction.objectId,
          expires_at: expiresAt,
        });
        setShareToken(created.token);
        setCollabMessage('Share link created.');
      }
    } catch (e: any) {
      setCollabError(e?.message || 'Failed to create collaboration item.');
    } finally {
      setCollabBusy(false);
    }
  };

  const updateCollabTarget = (target: CollabTarget) => {
    setCollabAction((prev) => {
      if (!prev) return prev;
      const nextId = target === 'log' ? prev.logId : prev.traceId || prev.logId;
      return { ...prev, objectType: target, objectId: nextId };
    });
  };

  const copyShareToken = async () => {
    if (!shareToken || !navigator.clipboard) return;
    await navigator.clipboard.writeText(shareToken);
    setCollabMessage('Share token copied.');
  };

  const formatTime = (ms: number) => {
    return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return '-';
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const getStatusVariant = (status?: string) => {
    const normalized = status?.toLowerCase();
    if (normalized === 'success') return 'success';
    if (normalized === 'error') return 'danger';
    if (normalized === 'warning') return 'warning';
    return 'neutral';
  };

  const activeFilters = filters.filter((f) => f.value.trim());
  const showGenericResults = queryMode === 'aql' && aqlResult && aqlResult.shape !== 'project_logs';

  return (
    <div className="flex flex-col h-full transition-colors duration-300">
      {/* Toolbar / Filters */}
      <div className="px-6 py-3 border-b border-border-hairline flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <Select
            className="text-[11px] font-semibold uppercase tracking-wide"
            value={statusValue}
            onChange={(e) => handleStatusChange(e.target.value)}
          >
            <option value="all">Status: All</option>
            <option value="success">Success</option>
            <option value="error">Error</option>
          </Select>

          <Select
            className="text-[11px] font-semibold uppercase tracking-wide"
            value={eventTypeValue}
            onChange={(e) => handleEventTypeChange(e.target.value)}
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
            onChange={(e) => handleTimeRangeChange(e.target.value)}
          >
            {TIME_RANGES.map((range) => (
              <option key={range.value} value={range.value}>
                {range.label}
              </option>
            ))}
          </Select>

          <Button
            onClick={() => setShowAddFilter((prev) => !prev)}
            size="sm"
            variant="outline"
            className="text-xs"
          >
            <FunnelIcon className="w-3.5 h-3.5" />
            Filters
          </Button>

          <Button
            onClick={() => {
              if (!showAql) {
                setAqlQuery(aqlPreview);
              }
              setShowAql((prev) => !prev);
            }}
            size="sm"
            variant="outline"
            className="text-xs"
          >
            AQL
            <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform ${showAql ? 'rotate-180' : ''}`} />
          </Button>

          <div className="relative">
            <Button
              onClick={() => setShowViewsList(!showViewsList)}
              size="sm"
              variant="outline"
              className="text-xs"
            >
              <BookmarkIcon className="w-3.5 h-3.5" />
              Views
            </Button>
            {showViewsList && (
              <div className="absolute right-0 top-full mt-2 w-56 bg-panel border border-border-base rounded-md shadow-lg z-20 py-1">
                {views.length === 0 && <div className="px-3 py-2 text-text-muted italic">No saved views</div>}
                {views.map(v => (
                  <div
                    key={v.id}
                    onClick={() => applyView(v)}
                    className="px-3 py-2 hover:bg-panel-hover cursor-pointer flex justify-between items-center group"
                  >
                    <span className="text-text-main truncate text-xs">{v.name}</span>
                    <button onClick={(e) => handleDeleteView(e, v.id)} className="opacity-0 group-hover:opacity-100 hover:text-rose-500">
                      <XMarkIcon className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <div className="border-t border-border-base mt-1 pt-1 px-2 pb-1">
                  {showSaveView ? (
                    <div className="flex flex-col gap-2 mt-1">
                      <Input
                        autoFocus
                        placeholder="View Name"
                        value={newViewName}
                        onChange={e => setNewViewName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSaveView()}
                        className="text-xs"
                      />
                      <Button onClick={handleSaveView} size="sm" variant="primary" className="text-xs">
                        Save
                      </Button>
                    </div>
                  ) : (
                    <Button
                      onClick={() => setShowSaveView(true)}
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start text-primary text-[10px] font-bold tracking-wider"
                    >
                      + Save Current View
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>

          <Button
            onClick={() => loadLogs(queryMode === 'aql' ? aqlQuery : undefined)}
            size="sm"
            variant="secondary"
            className="text-xs"
          >
            Refresh
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-[10px] uppercase tracking-widest text-text-muted font-bold">Quick Filters</span>
          {QUICK_FILTERS.map((filter) => (
            <Button
              key={filter.label}
              onClick={() => applyQuickFilter(filter)}
              size="sm"
              variant="outline"
              className="rounded-full text-[11px]"
            >
              {filter.label}
            </Button>
          ))}
          {activeFilters.length > 0 && (
            <Button
              onClick={clearFilters}
              variant="ghost"
              size="sm"
              className="text-[10px] font-bold uppercase tracking-wider text-rose-500 hover:text-rose-600"
            >
              Clear All
            </Button>
          )}
        </div>

        {activeFilters.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {activeFilters.map((filter) => (
              <div key={filter.id} className="flex items-center gap-2 px-3 py-1.5 bg-panel border border-border-base rounded-md text-xs text-text-main">
                <span className="font-semibold">{FIELD_LABELS[filter.field] || filter.field}</span>
                <span className="text-text-muted">{filter.op}</span>
                <span className="text-text-muted">{filter.value}</span>
                <button onClick={() => removeFilter(filter.id)} className="text-text-muted hover:text-rose-500">
                  <XMarkIcon className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {showAddFilter && (
          <div className="bg-panel border border-border-base rounded-lg p-4 flex flex-wrap items-center gap-3">
            <Select
              value={newFilter.field}
              onChange={(e) => {
                const field = e.target.value;
                const fieldType = FIELD_TYPES[field] || 'string';
                setNewFilter({
                  field,
                  op: OP_BY_TYPE[fieldType][0],
                  value: '',
                });
              }}
              className="text-xs"
            >
              {FILTER_FIELDS.map((field) => (
                <option key={field} value={field}>
                  {FIELD_LABELS[field] || field}
                </option>
              ))}
            </Select>
            <Select
              value={newFilter.op}
              onChange={(e) => setNewFilter((prev) => ({ ...prev, op: e.target.value }))}
              className="text-xs"
            >
              {(OP_BY_TYPE[FIELD_TYPES[newFilter.field] || 'string'] || []).map((op) => (
                <option key={op} value={op}>{op}</option>
              ))}
            </Select>
            <Input
              value={newFilter.value}
              onChange={(e) => setNewFilter((prev) => ({ ...prev, value: e.target.value }))}
              className="flex-1 min-w-[160px] text-xs"
              placeholder="Value"
            />
            <Button
              onClick={handleAddFilter}
              size="sm"
              variant="primary"
              className="text-xs"
            >
              <PlusIcon className="w-3 h-3" />
              Add Filter
            </Button>
          </div>
        )}

        {showAql && (
          <div className="bg-panel border border-border-base rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-text-muted font-bold">AQL Query</div>
                <div className="text-xs text-text-muted">Advanced mode (builder generates this automatically).</div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => {
                    setQueryMode('builder');
                    loadLogs();
                  }}
                  size="sm"
                  variant={queryMode === 'builder' ? 'secondary' : 'ghost'}
                  className={`text-[10px] font-bold uppercase tracking-wider ${queryMode === 'builder' ? 'text-primary' : ''}`}
                >
                  Builder
                </Button>
                <Button
                  onClick={() => setQueryMode('aql')}
                  size="sm"
                  variant={queryMode === 'aql' ? 'secondary' : 'ghost'}
                  className={`text-[10px] font-bold uppercase tracking-wider ${queryMode === 'aql' ? 'text-primary' : ''}`}
                >
                  AQL
                </Button>
              </div>
            </div>
            <Textarea
              value={queryMode === 'aql' ? aqlQuery : aqlPreview}
              onChange={(e) => setAqlQuery(e.target.value)}
              readOnly={queryMode !== 'aql'}
              className="font-mono text-xs h-28"
            />
            <div className="flex items-center justify-between">
              <div className="text-[10px] text-text-muted uppercase tracking-widest font-bold">
                {queryMode === 'aql' ? 'Manual query' : 'Read-only preview. Use Builder to edit.'}
              </div>
              <Button
                onClick={runAql}
                size="sm"
                variant="primary"
                className="text-xs"
                disabled={queryMode !== 'aql'}
              >
                Run AQL
              </Button>
            </div>
          </div>
        )}

        {error && <div className="text-xs text-rose-500 font-bold bg-rose-500/10 rounded-md p-3">{error}</div>}
      </div>

      {/* Header - Simplified */}
      {!showGenericResults && (
        <div className="grid grid-cols-12 gap-4 px-5 py-2.5 text-xs font-medium text-text-muted border-b border-border-base">
          <div className="col-span-2">Time</div>
          <div className="col-span-1">Trace ID</div>
          <div className="col-span-5">Message</div>
          <div className="col-span-1 text-right">Latency</div>
          <div className="col-span-1 text-right">Tokens</div>
          <div className="col-span-1 text-right">Cost</div>
          <div className="col-span-1 text-center">Status</div>
        </div>
      )}

      {/* List / Results */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-8 text-center text-text-muted text-sm italic">Loading logs...</div>
        ) : showGenericResults && aqlResult ? (
          <div className="p-6">
            <div className="text-xs text-text-muted uppercase tracking-widest font-bold mb-3">AQL Results</div>
            {aqlResult.data.length === 0 ? (
              <div className="p-8 text-center text-text-muted text-sm italic">No rows returned.</div>
            ) : (
              <div className="bg-panel border border-border-base rounded-lg overflow-hidden">
                <table className="min-w-full text-xs text-text-main">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-text-muted border-b border-border-base">
                      {(aqlResult.schema || Object.keys(aqlResult.data[0] || {})).map((col) => (
                        <th key={col} className="text-left py-2 px-4">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {aqlResult.data.map((row, idx) => (
                      <tr key={idx} className="border-b border-border-base/60">
                        {(aqlResult.schema || Object.keys(row)).map((col) => (
                          <td key={`${idx}-${col}`} className="py-2 px-4 text-text-muted">
                            {typeof row[col] === 'object' ? JSON.stringify(row[col]) : String(row[col])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-text-muted text-sm italic">No logs found matching filters.</div>
        ) : (
          logs.map((log) => {
            const isSelected = selectedLogId === log.id;

            return (
              <div
                key={log.id}
                onClick={() => {
                  onSelectLog(log);
                  if (log.trace_id && onOpenTrace) {
                    onOpenTrace(log.trace_id);
                  }
                }}
                className={`grid grid-cols-12 gap-4 px-5 py-3 text-sm border-b border-border-hairline cursor-pointer hover:bg-panel-hover transition-colors ${isSelected ? 'bg-primary/5' : ''}`}
              >
                {/* Time */}
                <div className="col-span-2 text-text-muted text-xs flex items-center tabular-nums">
                  {formatTime(log.timestamp)}
                </div>

                {/* Trace ID */}
                <div className="col-span-1 text-text-muted text-xs flex items-center font-mono truncate opacity-75">
                  {log.trace_id ? log.trace_id.slice(0, 8) : '-'}
                </div>

                {/* Message + Event Type */}
                <div className="col-span-5 flex items-center gap-3 min-w-0">
                  <span className="text-text-main truncate flex-1" title={log.message}>
                    {log.message}
                  </span>
                  {log.event_type && (
                    <Badge variant="neutral" className="text-[10px] flex-shrink-0">
                      {log.event_type}
                    </Badge>
                  )}
                </div>

                {/* Latency */}
                <div className="col-span-1 text-text-muted text-xs flex items-center justify-end tabular-nums">
                  {formatDuration(log.latency_ms)}
                </div>

                {/* Tokens */}
                <div className="col-span-1 text-text-muted text-xs flex items-center justify-end tabular-nums">
                  {log.total_tokens !== undefined ? log.total_tokens : '-'}
                </div>

                {/* Cost */}
                <div className="col-span-1 text-text-muted text-xs flex items-center justify-end tabular-nums">
                  {log.cost !== undefined ? `$${log.cost.toFixed(6)}` : '-'}
                </div>

                {/* Status */}
                <div className="col-span-1 flex items-center justify-center">
                  <Badge variant={getStatusVariant(log.status)}>
                    {(log.status || 'ok').toUpperCase()}
                  </Badge>
                </div>
              </div>
            );
          })
        )}
      </div>

      <Modal
        open={!!collabAction}
        title={
          collabAction?.kind === 'assignment'
            ? 'Create assignment'
            : collabAction?.kind === 'mention'
              ? 'Create mention'
              : 'Create share link'
        }
        description="Attach a collaboration record to this log or its trace."
        onClose={closeCollab}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={closeCollab}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCollabSubmit} disabled={collabBusy}>
              {collabBusy ? 'Saving...' : 'Create'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {collabError && (
            <div className="text-xs text-rose-500 font-semibold bg-rose-500/10 rounded-md p-3">
              {collabError}
            </div>
          )}
          {collabMessage && (
            <div className="text-xs text-emerald-600 font-semibold bg-emerald-500/10 rounded-md p-3">
              {collabMessage}
            </div>
          )}

          {collabAction?.traceId && (
            <div>
              <label className="text-[11px] font-medium text-text-muted">Target</label>
              <Select
                value={collabAction.objectType}
                onChange={(e) => updateCollabTarget(e.target.value as CollabTarget)}
                className="mt-1"
              >
                <option value="log">Log</option>
                <option value="trace">Trace</option>
              </Select>
            </div>
          )}

          <div>
            <label className="text-[11px] font-medium text-text-muted">Object</label>
            <div className="mt-1 rounded-md border border-border-base bg-app px-3 py-2 text-xs text-text-muted">
              {collabAction?.objectType} · {collabAction?.objectId}
            </div>
          </div>

          {collabAction?.kind === 'assignment' && (
            <>
              <div>
                <label className="text-[11px] font-medium text-text-muted">Assignee</label>
                <Input
                  value={collabAssignee}
                  onChange={(e) => setCollabAssignee(e.target.value)}
                  placeholder="name@company.com"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-text-muted">Note</label>
                <Textarea
                  rows={3}
                  value={collabNote}
                  onChange={(e) => setCollabNote(e.target.value)}
                  placeholder="Optional context"
                  className="mt-1"
                />
              </div>
            </>
          )}

          {collabAction?.kind === 'mention' && (
            <>
              <div>
                <label className="text-[11px] font-medium text-text-muted">Mention</label>
                <Input
                  value={collabMention}
                  onChange={(e) => setCollabMention(e.target.value)}
                  placeholder="name@company.com"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-text-muted">Note</label>
                <Textarea
                  rows={3}
                  value={collabNote}
                  onChange={(e) => setCollabNote(e.target.value)}
                  placeholder="Optional context"
                  className="mt-1"
                />
              </div>
            </>
          )}

          {collabAction?.kind === 'share' && (
            <>
              <div>
                <label className="text-[11px] font-medium text-text-muted">Expires At</label>
                <Input
                  type="datetime-local"
                  value={shareExpiry}
                  onChange={(e) => setShareExpiry(e.target.value)}
                  className="mt-1"
                />
              </div>
              {shareToken && (
                <div className="flex items-center justify-between rounded-md border border-border-base bg-app px-3 py-2 text-xs text-text-main">
                  <span className="font-mono">{shareToken}</span>
                  <Button size="sm" variant="ghost" onClick={copyShareToken}>
                    Copy
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default LogTable;

