import React, { useEffect, useMemo, useState } from 'react';
import { Log, AqlQueryResponse, AqlBuilder } from '../types';
import {
  CpuChipIcon,
  BookmarkIcon,
  XMarkIcon,
  ArrowTopRightOnSquareIcon,
  FunnelIcon,
  PlusIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';
import { api, View } from '../services/api';

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

const RESULT_LIMIT = 200;

const FIELD_TYPES: Record<string, 'string' | 'number'> = {
  id: 'string',
  trace_id: 'string',
  span_id: 'string',
  level: 'string',
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
  level: 'Level',
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
  'level',
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
  { label: 'Errors', field: 'level', op: '=', value: 'ERROR' },
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

const makeId = () => `f_${Math.random().toString(36).slice(2, 9)}`;


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

  const [newFilter, setNewFilter] = useState({
    field: FILTER_FIELDS[0],
    op: OP_BY_TYPE[FIELD_TYPES[FILTER_FIELDS[0]] || 'string'][0],
    value: '',
  });

  const levelValue = useMemo(() => {
    const levelFilter = filters.find((f) => f.field === 'level' && f.op === '=');
    return levelFilter?.value || 'all';
  }, [filters]);

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
      'level',
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

  const handleLevelChange = (level: string) => {
    if (level === 'all') {
      upsertFilter('level', '=', '');
      return;
    }
    upsertFilter('level', '=', level);
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
      setFilters(cfg.filters || []);
      const searchFilter = (cfg.filters || []).find((f: Filter) => f.field === 'message' && f.op === 'contains');
      setSearchInput(searchFilter?.value || '');
      const timeFilter = (cfg.filters || []).find((f: Filter) => f.field === 'timestamp' && f.op === '>=');
      setTimeRange(timeFilter ? 'custom' : 'all');
      loadLogs(cfg.query);
    } else if (cfg.filters) {
      setQueryMode('builder');
      setShowAql(false);
      setFilters(cfg.filters || []);
      const searchFilter = (cfg.filters || []).find((f: Filter) => f.field === 'message' && f.op === 'contains');
      setSearchInput(searchFilter?.value || '');
      const timeFilter = (cfg.filters || []).find((f: Filter) => f.field === 'timestamp' && f.op === '>=');
      setTimeRange(timeFilter ? 'custom' : 'all');
    } else {
      setQueryMode('builder');
      setShowAql(false);
      if (cfg.level) upsertFilter('level', '=', cfg.level);
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

  const formatTime = (ms: number) => {
    return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return '-';
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const getLevelBadge = (level: string) => {
    const colors: Record<string, string> = {
      'DEBUG': 'bg-gray-500/10 text-gray-500 border-gray-500/20',
      'INFO': 'bg-blue-500/10 text-blue-500 border-blue-500/20',
      'WARN': 'bg-amber-500/10 text-amber-500 border-amber-500/20',
      'ERROR': 'bg-rose-500/10 text-rose-500 border-rose-500/20',
    };
    return colors[level] || colors['INFO'];
  };

  const activeFilters = filters.filter((f) => f.value.trim());
  const showGenericResults = queryMode === 'aql' && aqlResult && aqlResult.shape !== 'project_logs';

  return (
    <div className="flex flex-col h-full bg-app transition-colors duration-300">
      {/* Toolbar / Filters */}
      <div className="px-6 py-3 border-b border-border-base flex flex-col gap-3 bg-app">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={handleSearch}
              placeholder="Search message contains (Enter to apply)..."
              className="w-full bg-panel border border-border-base text-sm text-text-main rounded-xl pl-4 pr-10 py-2 focus:outline-none focus:ring-2 focus:ring-wispr-purple/20 focus:border-wispr-purple placeholder-text-muted/40 transition-all"
            />
          </div>

          <select
            className="px-4 py-2 bg-panel border border-border-base rounded-xl text-xs text-text-muted font-semibold hover:text-text-main hover:border-border-hover focus:outline-none focus:ring-2 focus:ring-wispr-purple/20 cursor-pointer transition-all"
            value={levelValue}
            onChange={(e) => handleLevelChange(e.target.value)}
          >
            <option value="all">LEVEL: ALL</option>
            <option value="DEBUG">DEBUG</option>
            <option value="INFO">INFO</option>
            <option value="WARN">WARN</option>
            <option value="ERROR">ERROR</option>
          </select>

          <select
            className="px-4 py-2 bg-panel border border-border-base rounded-xl text-xs text-text-muted font-semibold hover:text-text-main hover:border-border-hover focus:outline-none focus:ring-2 focus:ring-wispr-purple/20 cursor-pointer transition-all"
            value={timeRange}
            onChange={(e) => handleTimeRangeChange(e.target.value)}
          >
            {TIME_RANGES.map((range) => (
              <option key={range.value} value={range.value}>
                {range.label}
              </option>
            ))}
          </select>

          <button
            onClick={() => setShowAddFilter((prev) => !prev)}
            className="px-3 py-2 bg-panel border border-border-base rounded-xl text-xs text-text-muted font-semibold hover:text-text-main hover:border-border-hover transition-all flex items-center gap-2"
          >
            <FunnelIcon className="w-3.5 h-3.5" />
            Filters
          </button>

          <button
            onClick={() => {
              if (!showAql) {
                setAqlQuery(aqlPreview);
              }
              setShowAql((prev) => !prev);
            }}
            className="px-3 py-2 bg-panel border border-border-base rounded-xl text-xs text-text-muted font-semibold hover:text-text-main hover:border-border-hover transition-all flex items-center gap-2"
          >
            AQL
            <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform ${showAql ? 'rotate-180' : ''}`} />
          </button>

          <div className="relative">
            <button
              onClick={() => setShowViewsList(!showViewsList)}
              className="px-4 py-2 bg-panel border border-border-base rounded-xl text-xs text-text-muted font-semibold hover:text-text-main hover:border-border-hover transition-all flex items-center gap-2"
            >
              <BookmarkIcon className="w-3.5 h-3.5" />
              VIEWS
            </button>
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
                      <input
                        autoFocus
                        className="bg-app border border-border-base rounded px-2 py-1 text-xs text-text-main"
                        placeholder="View Name"
                        value={newViewName}
                        onChange={e => setNewViewName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSaveView()}
                      />
                      <button onClick={handleSaveView} className="bg-wispr-purple text-white rounded-lg px-2 py-1.5 text-xs font-bold shadow-lg shadow-wispr-purple/20">Save</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowSaveView(true)}
                      className="w-full text-left px-2 py-1.5 text-wispr-purple hover:text-wispr-purple-dark text-[10px] font-bold tracking-wider"
                    >
                      + SAVE CURRENT VIEW
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => loadLogs(queryMode === 'aql' ? aqlQuery : undefined)}
            className="px-3 py-2 bg-panel border border-border-base rounded-xl text-xs text-text-muted font-semibold hover:text-text-main hover:border-border-hover transition-all"
          >
            Refresh
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-[10px] uppercase tracking-widest text-text-muted font-bold">Quick Filters</span>
          {QUICK_FILTERS.map((filter) => (
            <button
              key={filter.label}
              onClick={() => applyQuickFilter(filter)}
              className="px-3 py-1.5 rounded-full bg-panel border border-border-base text-text-muted hover:text-text-main hover:border-border-hover transition-all"
            >
              {filter.label}
            </button>
          ))}
          {activeFilters.length > 0 && (
            <button
              onClick={clearFilters}
              className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-rose-500 hover:text-rose-600"
            >
              Clear All
            </button>
          )}
        </div>

        {activeFilters.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {activeFilters.map((filter) => (
              <div key={filter.id} className="flex items-center gap-2 px-3 py-1.5 bg-panel border border-border-base rounded-full text-xs text-text-main">
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
          <div className="bg-panel border border-border-base rounded-2xl p-4 flex flex-wrap items-center gap-3">
            <select
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
              className="bg-app border border-border-base rounded-xl px-3 py-2 text-xs text-text-main"
            >
              {FILTER_FIELDS.map((field) => (
                <option key={field} value={field}>
                  {FIELD_LABELS[field] || field}
                </option>
              ))}
            </select>
            <select
              value={newFilter.op}
              onChange={(e) => setNewFilter((prev) => ({ ...prev, op: e.target.value }))}
              className="bg-app border border-border-base rounded-xl px-3 py-2 text-xs text-text-main"
            >
              {(OP_BY_TYPE[FIELD_TYPES[newFilter.field] || 'string'] || []).map((op) => (
                <option key={op} value={op}>{op}</option>
              ))}
            </select>
            <input
              value={newFilter.value}
              onChange={(e) => setNewFilter((prev) => ({ ...prev, value: e.target.value }))}
              className="bg-app border border-border-base rounded-xl px-3 py-2 text-xs text-text-main flex-1 min-w-[160px]"
              placeholder="Value"
            />
            <button
              onClick={handleAddFilter}
              className="px-3 py-2 bg-wispr-purple text-white rounded-xl text-xs font-bold shadow-lg shadow-wispr-purple/20 hover:bg-wispr-purple-dark transition-all flex items-center gap-2"
            >
              <PlusIcon className="w-3 h-3" />
              Add Filter
            </button>
          </div>
        )}

        {showAql && (
          <div className="bg-panel border border-border-base rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-text-muted font-bold">AQL Query</div>
                <div className="text-xs text-text-muted">Advanced mode (builder generates this automatically).</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setQueryMode('builder');
                    loadLogs();
                  }}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider border ${queryMode === 'builder'
                    ? 'bg-wispr-purple/10 text-wispr-purple border-wispr-purple/30'
                    : 'bg-app text-text-muted border-border-base hover:text-text-main'
                    }`}
                >
                  Builder
                </button>
                <button
                  onClick={() => setQueryMode('aql')}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider border ${queryMode === 'aql'
                    ? 'bg-wispr-purple/10 text-wispr-purple border-wispr-purple/30'
                    : 'bg-app text-text-muted border-border-base hover:text-text-main'
                    }`}
                >
                  AQL
                </button>
              </div>
            </div>
            <textarea
              value={queryMode === 'aql' ? aqlQuery : aqlPreview}
              onChange={(e) => setAqlQuery(e.target.value)}
              readOnly={queryMode !== 'aql'}
              className="w-full bg-app border border-border-base rounded-xl p-3 text-xs text-text-main font-mono resize-none h-28"
            />
            <div className="flex items-center justify-between">
              <div className="text-[10px] text-text-muted uppercase tracking-widest font-bold">
                {queryMode === 'aql' ? 'Manual query' : 'Read-only preview'}
              </div>
              <button
                onClick={runAql}
                className="px-3 py-1.5 bg-wispr-purple text-white rounded-xl text-xs font-bold shadow-lg shadow-wispr-purple/20 hover:bg-wispr-purple-dark transition-all"
                disabled={queryMode !== 'aql'}
              >
                Run AQL
              </button>
            </div>
          </div>
        )}

        {error && <div className="text-xs text-rose-500 font-bold bg-rose-500/10 rounded-xl p-3">{error}</div>}
      </div>

      {/* Header */}
      {!showGenericResults && (
        <div className="grid grid-cols-12 gap-4 px-6 py-2 text-xs font-semibold text-text-muted border-b border-border-base bg-app/95 sticky top-0 z-10 backdrop-blur-sm">
          <div className="col-span-2">Time</div>
          <div className="col-span-3">Message</div>
          <div className="col-span-2">Model</div>
          <div className="col-span-1 text-right">Latency</div>
          <div className="col-span-2 text-right">Tokens</div>
          <div className="col-span-1 text-right">Cost</div>
          <div className="col-span-1 text-center">Level</div>
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
              <div className="bg-panel border border-border-base rounded-2xl overflow-hidden">
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
                onClick={() => onSelectLog(log)}
                className={`grid grid-cols-12 gap-4 px-6 py-4 text-sm border-b border-border-base/50 cursor-pointer hover:bg-panel-hover transition-all duration-200 ${isSelected ? 'bg-wispr-purple/10 border-wispr-purple/30' : ''
                  }`}
              >
                <div className="col-span-2 text-text-muted text-xs flex items-center tabular-nums gap-2">
                  {formatTime(log.timestamp)}
                  {log.trace_id && onOpenTrace && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onOpenTrace(log.trace_id!); }}
                      className="p-1 hover:bg-wispr-purple/10 rounded transition-colors"
                      title="View Trace"
                    >
                      <ArrowTopRightOnSquareIcon className="w-3 h-3 text-wispr-purple" />
                    </button>
                  )}
                </div>

                <div className="col-span-3 flex flex-col justify-center min-w-0">
                  <span className="font-medium text-text-main truncate" title={log.message}>{log.message}</span>
                  {log.trace_id && (
                    <span className="text-[10px] text-text-muted truncate">trace: {log.trace_id.substring(0, 8)}...</span>
                  )}
                </div>

                <div className="col-span-2 text-text-muted text-xs flex items-center truncate">
                  {log.model && <CpuChipIcon className="w-3 h-3 mr-1.5 opacity-50" />}
                  {log.model || '-'}
                </div>

                <div className="col-span-1 text-right text-text-main text-xs flex items-center justify-end tabular-nums">
                  {formatDuration(log.latency_ms)}
                </div>

                <div className="col-span-2 text-right text-text-muted text-xs flex items-center justify-end tabular-nums">
                  {log.total_tokens ? log.total_tokens.toLocaleString() : '-'}
                </div>

                <div className="col-span-1 text-right text-text-muted text-xs flex items-center justify-end tabular-nums">
                  {log.cost ? `$${log.cost.toFixed(4)}` : '-'}
                </div>

                <div className="col-span-1 flex items-center justify-center">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getLevelBadge(log.level)}`}>
                    {log.level}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default LogTable;
