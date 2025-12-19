import React, { useState, useEffect } from 'react';
import { Trace } from '../types';
import { ClockIcon, CurrencyDollarIcon, CpuChipIcon, FunnelIcon, BookmarkIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { api, View } from '../services/api';

interface LogTableProps {
  traces: Trace[];
  onSelectTrace: (traceId: string) => void;
  selectedTraceId: string | null;
  projectId: string;
  onRefresh: () => void; // Trigger parent refresh
  setFilters: (filters: { status?: string, search?: string }) => void;
  currentFilters: { status?: string, search?: string };
}

const LogTable: React.FC<LogTableProps> = ({
  traces,
  onSelectTrace,
  selectedTraceId,
  projectId,
  onRefresh,
  setFilters,
  currentFilters
}) => {
  const [searchInput, setSearchInput] = useState(currentFilters.search || '');
  const [statusFilter, setStatusFilter] = useState(currentFilters.status || 'all');

  // Views State
  const [views, setViews] = useState<View[]>([]);
  const [showSaveView, setShowSaveView] = useState(false);
  const [newViewName, setNewViewName] = useState('');
  const [showViewsList, setShowViewsList] = useState(false);

  useEffect(() => {
    if (projectId) {
      loadViews();
    }
  }, [projectId]);

  const loadViews = async () => {
    try {
      const vs = await api.getViews(projectId);
      setViews(vs);
    } catch (e) {
      console.error("Failed to load views", e);
    }
  };

  const handleSearch = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      setFilters({ ...currentFilters, search: searchInput });
    }
  };

  const handleStatusChange = (status: string) => {
    setStatusFilter(status);
    setFilters({ ...currentFilters, status });
  };

  const handleSaveView = async () => {
    if (!newViewName.trim()) return;
    try {
      await api.createView({
        project_id: projectId,
        name: newViewName,
        config: { status: statusFilter, search: searchInput }
      });
      setNewViewName('');
      setShowSaveView(false);
      loadViews();
    } catch (e) {
      console.error("Failed to save view", e);
    }
  };

  const applyView = (view: View) => {
    setSearchInput(view.config.search || '');
    setStatusFilter(view.config.status || 'all');
    setFilters({
      status: view.config.status,
      search: view.config.search
    });
    setShowViewsList(false);
  };

  const handleDeleteView = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm('Delete this view?')) {
      await api.deleteView(id);
      loadViews();
    }
  }

  const formatTime = (ms: number) => {
    return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  return (
    <div className="flex flex-col h-full bg-app transition-colors duration-300">
      {/* Toolbar / Filters */}
      <div className="px-6 py-3 border-b border-border-base flex items-center gap-4 bg-app">
        <div className="relative flex-1">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleSearch}
            placeholder="Search logs (Enter to apply)..."
            className="w-full bg-panel border border-border-base text-sm text-text-main rounded-xl pl-4 pr-10 py-2 focus:outline-none focus:ring-2 focus:ring-wispr-purple/20 focus:border-wispr-purple placeholder-text-muted/40 transition-all"
          />
        </div>

        <div className="flex gap-2 text-xs items-center relative">
          {/* Status Filter */}
          <select
            className="px-4 py-2 bg-panel border border-border-base rounded-xl text-xs text-text-muted font-semibold hover:text-text-main hover:border-border-hover focus:outline-none focus:ring-2 focus:ring-wispr-purple/20 cursor-pointer transition-all"
            value={statusFilter}
            onChange={(e) => handleStatusChange(e.target.value)}
          >
            <option value="all">STATUS: ALL</option>
            <option value="success">SUCCESS</option>
            <option value="error">ERROR</option>
          </select>

          {/* Views Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowViewsList(!showViewsList)}
              className="px-4 py-2 bg-panel border border-border-base rounded-xl text-xs text-text-muted font-semibold hover:text-text-main hover:border-border-hover transition-all flex items-center gap-2"
            >
              <BookmarkIcon className="w-3.5 h-3.5" />
              VIEWS
            </button>
            {showViewsList && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-panel border border-border-base rounded-md shadow-lg z-20 py-1">
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
        </div>
      </div>

      {/* Header */}
      <div className="grid grid-cols-12 gap-4 px-6 py-2 text-xs font-semibold text-text-muted border-b border-border-base bg-app/95 sticky top-0 z-10 backdrop-blur-sm">
        <div className="col-span-2">Time</div>
        <div className="col-span-3">Trace Name</div>
        <div className="col-span-2">Model</div>
        <div className="col-span-1 text-right">Latency</div>
        <div className="col-span-2 text-right">Tokens</div>
        <div className="col-span-1 text-right">Cost</div>
        <div className="col-span-1 text-center">Status</div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {traces.map((trace) => {
          const isSelected = selectedTraceId === trace.id;
          const root = trace.root_span;
          const model = trace.spans.find(s => s.attributes.model)?.attributes.model || '-';

          return (
            <div
              key={trace.id}
              onClick={() => onSelectTrace(trace.id)}
              className={`grid grid-cols-12 gap-4 px-6 py-4 text-sm border-b border-border-base/50 cursor-pointer hover:bg-panel-hover transition-all duration-200 ${isSelected ? 'bg-wispr-purple/10 border-wispr-purple/30' : ''
                }`}
            >
              <div className="col-span-2 text-text-muted text-xs flex items-center tabular-nums">
                {formatTime(trace.timestamp)}
              </div>

              <div className="col-span-3 flex flex-col justify-center min-w-0">
                <span className="font-medium text-text-main truncate" title={root.name}>{root.name}</span>
                {trace.tags.length > 0 && (
                  <div className="flex items-center gap-1 mt-1 overflow-hidden">
                    {trace.tags.slice(0, 3).map(tag => (
                      <span key={tag} className="px-1.5 py-0.5 rounded text-[9px] bg-panel text-text-muted border border-border-base truncate max-w-[80px]" title={tag}>{tag}</span>
                    ))}
                    {trace.tags.length > 3 && (
                      <span className="text-[9px] text-text-muted">+{trace.tags.length - 3}</span>
                    )}
                  </div>
                )}
              </div>

              <div className="col-span-2 text-text-muted text-xs flex items-center truncate">
                {model !== '-' && <CpuChipIcon className="w-3 h-3 mr-1.5 opacity-50" />}
                {model}
              </div>

              <div className="col-span-1 text-right text-text-main text-xs flex items-center justify-end tabular-nums">
                {formatDuration(trace.total_latency)}
              </div>

              <div className="col-span-2 text-right text-text-muted text-xs flex items-center justify-end tabular-nums">
                {trace.total_tokens > 0 ? trace.total_tokens.toLocaleString() : '-'}
              </div>

              <div className="col-span-1 text-right text-text-muted text-xs flex items-center justify-end tabular-nums">
                {trace.total_cost > 0 ? `$${trace.total_cost.toFixed(4)}` : '-'}
              </div>

              <div className="col-span-1 flex items-center justify-center">
                {trace.status === 'success' ? (
                  <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]"></div>
                ) : (
                  <div className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]"></div>
                )}
              </div>
            </div>
          );
        })}
        {traces.length === 0 && (
          <div className="p-8 text-center text-text-muted text-sm italic">No traces found matching filters.</div>
        )}
      </div>
    </div>
  );
};

export default LogTable;
