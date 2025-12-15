import React from 'react';
import { Trace } from '../types';
import { ClockIcon, CurrencyDollarIcon, CpuChipIcon } from '@heroicons/react/24/outline';

interface LogTableProps {
  traces: Trace[];
  onSelectTrace: (traceId: string) => void;
  selectedTraceId: string | null;
}

const LogTable: React.FC<LogTableProps> = ({ traces, onSelectTrace, selectedTraceId }) => {
  
  const formatTime = (ms: number) => {
    return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  return (
    <div className="flex flex-col h-full bg-gray-950">
      {/* Toolbar / Filters (Placeholder) */}
      <div className="px-6 py-3 border-b border-gray-800 flex items-center gap-4 bg-gray-950">
        <input 
            type="text" 
            placeholder="Search logs (e.g. status:error or model:gpt-4)..." 
            className="flex-1 bg-gray-900 border border-gray-800 text-sm text-gray-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 placeholder-gray-600"
        />
        <div className="flex gap-2 text-xs">
            <button className="px-3 py-1.5 bg-gray-900 border border-gray-800 rounded text-gray-400 hover:text-white">Time: 24h</button>
            <button className="px-3 py-1.5 bg-gray-900 border border-gray-800 rounded text-gray-400 hover:text-white">Status: All</button>
        </div>
      </div>

      {/* Header */}
      <div className="grid grid-cols-12 gap-4 px-6 py-2 text-xs font-medium text-gray-500 border-b border-gray-800 bg-gray-950/50 sticky top-0 z-10">
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
              className={`grid grid-cols-12 gap-4 px-6 py-3 text-sm border-b border-gray-800/50 cursor-pointer hover:bg-gray-900/50 transition-colors ${
                isSelected ? 'bg-indigo-900/10 border-indigo-500/20' : ''
              }`}
            >
              <div className="col-span-2 text-gray-400 font-mono text-xs flex items-center">
                {formatTime(trace.timestamp)}
              </div>
              
              <div className="col-span-3 font-medium text-gray-200 truncate flex items-center gap-2">
                 <span className="truncate" title={root.name}>{root.name}</span>
                 {trace.tags.map(tag => (
                     <span key={tag} className="px-1.5 py-0.5 rounded text-[10px] bg-gray-800 text-gray-400 border border-gray-700">{tag}</span>
                 ))}
              </div>

              <div className="col-span-2 text-gray-400 text-xs flex items-center truncate">
                {model !== '-' && <CpuChipIcon className="w-3 h-3 mr-1.5 opacity-50" />}
                {model}
              </div>

              <div className="col-span-1 text-right text-gray-300 font-mono text-xs flex items-center justify-end">
                {formatDuration(trace.total_latency)}
              </div>

              <div className="col-span-2 text-right text-gray-400 font-mono text-xs flex items-center justify-end">
                {trace.total_tokens > 0 ? trace.total_tokens.toLocaleString() : '-'}
              </div>

              <div className="col-span-1 text-right text-gray-400 font-mono text-xs flex items-center justify-end">
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
            <div className="p-8 text-center text-gray-500 text-sm">No traces found for this period.</div>
        )}
      </div>
    </div>
  );
};

export default LogTable;
