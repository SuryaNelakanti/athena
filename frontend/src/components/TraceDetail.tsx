import React, { useState, useMemo } from 'react';
import { Trace, Span } from '../types';
import { 
    ClockIcon, 
    CurrencyDollarIcon, 
    CodeBracketIcon, 
    CheckCircleIcon, 
    ExclamationCircleIcon,
    ChevronDownIcon,
    ChevronRightIcon,
    CubeIcon,
    ChatBubbleLeftRightIcon
} from '@heroicons/react/24/outline';

interface TraceDetailProps {
  trace: Trace;
  onClose: () => void;
}

interface SpanRowProps {
    span: Span;
    depth: number;
    isSelected: boolean;
    onSelect: (s: Span) => void;
    minStart: number;
    totalDuration: number;
}

const SpanRow: React.FC<SpanRowProps> = ({ 
    span, 
    depth, 
    isSelected, 
    onSelect, 
    minStart, 
    totalDuration
}) => {
    // Calculate waterfall bar position
    const leftPercent = ((span.start_time - minStart) / totalDuration) * 100;
    const widthPercent = Math.max(((span.end_time - span.start_time) / totalDuration) * 100, 1); // Min 1% width

    const iconMap: Record<string, React.ReactNode> = {
        llm: <ChatBubbleLeftRightIcon className="w-3.5 h-3.5 text-purple-400" />,
        chain: <CubeIcon className="w-3.5 h-3.5 text-blue-400" />,
        tool: <CodeBracketIcon className="w-3.5 h-3.5 text-orange-400" />,
        retriever: <CodeBracketIcon className="w-3.5 h-3.5 text-teal-400" />,
    };

    return (
        <div 
            className={`group flex items-center py-2 px-4 hover:bg-gray-800/50 cursor-pointer border-l-2 ${isSelected ? 'bg-indigo-900/20 border-indigo-500' : 'border-transparent'}`}
            onClick={() => onSelect(span)}
        >
            <div className="flex-1 flex items-center overflow-hidden mr-4">
                <div style={{ paddingLeft: `${depth * 16}px` }} className="flex items-center gap-2 truncate">
                    {/* Placeholder for expand/collapse if implemented later */}
                    <span className="opacity-50">{iconMap[span.type]}</span>
                    <span className={`text-sm truncate ${isSelected ? 'text-white font-medium' : 'text-gray-300'}`}>{span.name}</span>
                    <span className="text-[10px] text-gray-600 border border-gray-800 px-1 rounded">{span.type}</span>
                </div>
            </div>
            
            {/* Waterfall visualization */}
            <div className="w-32 h-6 relative bg-gray-900/50 rounded overflow-hidden flex-shrink-0">
                 <div 
                    className={`absolute top-1 bottom-1 rounded-sm opacity-80 ${span.status === 'error' ? 'bg-rose-500' : 'bg-indigo-500'}`}
                    style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
                 />
            </div>
            
            <div className="w-16 text-right text-xs text-gray-400 font-mono ml-4">
                {span.metrics.latency_ms}ms
            </div>
        </div>
    );
}

const JSONViewer = ({ data, label }: { data: any, label: string }) => (
    <div className="mb-6">
        <h4 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-2">{label}</h4>
        <div className="bg-gray-950 border border-gray-800 rounded-md p-3 overflow-x-auto">
            <pre className="text-xs font-mono text-gray-300 whitespace-pre-wrap">
                {JSON.stringify(data, null, 2)}
            </pre>
        </div>
    </div>
);

const TraceDetail: React.FC<TraceDetailProps> = ({ trace, onClose }) => {
  const [selectedSpan, setSelectedSpan] = useState<Span>(trace.root_span);

  // Flatten the tree for the list (simplified: assumes order is somewhat preserved or handled by backend)
  // In a real app we'd traverse the tree. Here we trust the 'spans' array for the mock.
  const sortedSpans = useMemo(() => {
    return [...trace.spans].sort((a, b) => a.start_time - b.start_time);
  }, [trace.spans]);

  const minStart = trace.root_span.start_time;
  const totalDuration = trace.total_latency;

  return (
    <div className="h-full flex flex-col bg-gray-900 border-l border-gray-800">
        {/* Header */}
        <div className="h-14 border-b border-gray-800 flex items-center justify-between px-6 bg-gray-900 flex-shrink-0">
            <div className="flex items-center gap-4">
                <button onClick={onClose} className="text-gray-400 hover:text-white">
                    <ChevronRightIcon className="w-5 h-5" />
                </button>
                <div className="flex flex-col">
                    <h2 className="text-sm font-semibold text-white">{trace.root_span.name}</h2>
                    <div className="flex items-center gap-2 text-xs text-gray-500 font-mono">
                        <span>{trace.id}</span>
                        <span>•</span>
                        <span>{new Date(trace.timestamp).toLocaleString()}</span>
                    </div>
                </div>
                {trace.status === 'error' && (
                    <span className="flex items-center gap-1 text-xs text-rose-400 bg-rose-400/10 px-2 py-0.5 rounded border border-rose-400/20">
                        <ExclamationCircleIcon className="w-3 h-3" /> Error
                    </span>
                )}
            </div>
            
            <div className="flex items-center gap-4 text-xs">
                <div className="flex flex-col items-end">
                    <span className="text-gray-500">Latency</span>
                    <span className="text-gray-200 font-mono">{trace.total_latency}ms</span>
                </div>
                <div className="flex flex-col items-end">
                    <span className="text-gray-500">Tokens</span>
                    <span className="text-gray-200 font-mono">{trace.total_tokens}</span>
                </div>
                <div className="flex flex-col items-end">
                    <span className="text-gray-500">Cost</span>
                    <span className="text-gray-200 font-mono">${trace.total_cost.toFixed(4)}</span>
                </div>
            </div>
        </div>

        <div className="flex-1 flex min-h-0">
            {/* Left: Span List */}
            <div className="w-1/2 border-r border-gray-800 overflow-y-auto bg-gray-900/50">
                <div className="py-2">
                    {sortedSpans.map(span => (
                        <SpanRow 
                            key={span.id} 
                            span={span} 
                            depth={span.parent_id ? 1 : 0} // Simplified depth for mock
                            isSelected={selectedSpan.id === span.id}
                            onSelect={setSelectedSpan}
                            minStart={minStart}
                            totalDuration={totalDuration}
                        />
                    ))}
                </div>
            </div>

            {/* Right: Span Details */}
            <div className="w-1/2 overflow-y-auto bg-gray-900 p-6">
                <div className="mb-6 flex items-start justify-between">
                    <div>
                        <h3 className="text-lg font-medium text-white mb-1">{selectedSpan.name}</h3>
                        <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded text-xs bg-gray-800 text-gray-300 border border-gray-700 font-mono">
                                {selectedSpan.type}
                            </span>
                             <span className="px-2 py-0.5 rounded text-xs bg-gray-800 text-gray-300 border border-gray-700 font-mono">
                                {selectedSpan.id}
                            </span>
                        </div>
                    </div>
                    {selectedSpan.metrics.cost !== undefined && selectedSpan.metrics.cost > 0 && (
                        <div className="px-3 py-1 bg-emerald-900/20 border border-emerald-500/20 rounded text-emerald-400 text-xs font-mono">
                            ${selectedSpan.metrics.cost.toFixed(5)}
                        </div>
                    )}
                </div>

                {/* Attributes Grid */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                    {Object.entries(selectedSpan.attributes).map(([key, value]) => (
                        <div key={key} className="bg-gray-800/50 p-3 rounded border border-gray-800">
                            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">{key.replace('_', ' ')}</div>
                            <div className="text-sm text-gray-200 font-mono truncate">
                                {String(value)}
                            </div>
                        </div>
                    ))}
                    <div className="bg-gray-800/50 p-3 rounded border border-gray-800">
                         <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Tokens</div>
                         <div className="text-sm text-gray-200 font-mono">
                            {selectedSpan.metrics.total_tokens || 0}
                         </div>
                    </div>
                </div>

                <JSONViewer data={selectedSpan.input} label="Input" />
                <JSONViewer data={selectedSpan.output} label="Output" />
                
                {/* Reasoning Section (Atom 1.2 support) */}
                {selectedSpan.attributes.reasoning_enabled && (
                    <div className="mt-6 pt-6 border-t border-gray-800">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                            <h4 className="text-sm font-semibold text-purple-200">Reasoning Details</h4>
                        </div>
                        <p className="text-xs text-gray-500 mb-3">
                            This model used <span className="text-gray-300">{selectedSpan.attributes.reasoning_effort}</span> effort.
                            Reasoning deltas are captured and stored in attributes.
                        </p>
                    </div>
                )}
            </div>
        </div>
    </div>
  );
};

export default TraceDetail;