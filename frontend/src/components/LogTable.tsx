import React, { useState, useEffect } from 'react';
import { Log, Trace } from '../types';
import { ClockIcon, CurrencyDollarIcon, CpuChipIcon, FunnelIcon, BookmarkIcon, XMarkIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import { api, View } from '../services/api';

interface LogTableProps {
  projectId: string;
  onSelectLog: (log: Log) => void;
  onOpenTrace?: (traceId: string) => void;  // Drill-down to trace detail
  selectedLogId: string | null;
}

const LogTable: React.FC<LogTableProps> = ({
  projectId,
  onSelectLog,
  onOpenTrace,
  selectedLogId,
}) => {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [levelFilter, setLevelFilter] = useState('all');

  // Views State
  const [views, setViews] = useState<View[]>([]);
  const [showSaveView, setShowSaveView] = useState(false);
  const [newViewName, setNewViewName] = useState('');
  const [showViewsList, setShowViewsList] = useState(false);

  // Load logs when project or filters change
  useEffect(() => {
    if (projectId) {
      loadLogs();
      loadViews();
    }
  }, [projectId]);

  const loadLogs = async (filters?: { level?: string; search?: string }) => {
    setLoading(true);
    try {
      const fetchedLogs = await api.getLogs(projectId, {
        level: filters?.level && filters.level !== 'all' ? filters.level : undefined,
        search: filters?.search || undefined,
        limit: 100,
      });
      setLogs(fetchedLogs);
    } catch (e) {
      console.error("Failed to load logs", e);
    } finally {
      setLoading(false);
    }
  };

  const loadViews = async () => {
    try {
      const vs = await api.getViews(projectId);
      // Filter to only show log views
      setViews(vs.filter(v => v.config.entity_type === 'logs' || !v.config.entity_type));
    } catch (e) {
      console.error("Failed to load views", e);
    }
  };

  const handleSearch = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      loadLogs({ level: levelFilter, search: searchInput });
    }
  };

  const handleLevelChange = (level: string) => {
    setLevelFilter(level);
    loadLogs({ level, search: searchInput });
  };

  const handleSaveView = async () => {
    if (!newViewName.trim()) return;
    try {
      await api.createView({
        project_id: projectId,
        name: newViewName,
        config: { level: levelFilter, search: searchInput, entity_type: 'logs' }
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
    setLevelFilter(view.config.level || 'all');
    loadLogs({ level: view.config.level, search: view.config.search });
    setShowViewsList(false);
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
          {/* Level Filter */}
          <select
            className="px-4 py-2 bg-panel border border-border-base rounded-xl text-xs text-text-muted font-semibold hover:text-text-main hover:border-border-hover focus:outline-none focus:ring-2 focus:ring-wispr-purple/20 cursor-pointer transition-all"
            value={levelFilter}
            onChange={(e) => handleLevelChange(e.target.value)}
          >
            <option value="all">LEVEL: ALL</option>
            <option value="DEBUG">DEBUG</option>
            <option value="INFO">INFO</option>
            <option value="WARN">WARN</option>
            <option value="ERROR">ERROR</option>
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

          {/* Refresh button */}
          <button
            onClick={() => loadLogs({ level: levelFilter, search: searchInput })}
            className="px-3 py-2 bg-panel border border-border-base rounded-xl text-xs text-text-muted font-semibold hover:text-text-main hover:border-border-hover transition-all"
          >
            ↻
          </button>
        </div>
      </div>

      {/* Header */}
      <div className="grid grid-cols-12 gap-4 px-6 py-2 text-xs font-semibold text-text-muted border-b border-border-base bg-app/95 sticky top-0 z-10 backdrop-blur-sm">
        <div className="col-span-2">Time</div>
        <div className="col-span-3">Message</div>
        <div className="col-span-2">Model</div>
        <div className="col-span-1 text-right">Latency</div>
        <div className="col-span-2 text-right">Tokens</div>
        <div className="col-span-1 text-right">Cost</div>
        <div className="col-span-1 text-center">Level</div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-8 text-center text-text-muted text-sm italic">Loading logs...</div>
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
