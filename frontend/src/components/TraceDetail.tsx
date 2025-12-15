import React, { useState, useMemo, useEffect } from 'react';
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
import { Tooltip } from './Tooltip';

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
    const widthPercent = Math.max(((span.end_time - span.start_time) / totalDuration) * 100, 1);

    const iconMap: Record<string, React.ReactNode> = {
        llm: <ChatBubbleLeftRightIcon className="w-3.5 h-3.5 text-purple-600" />,
        chain: <CubeIcon className="w-3.5 h-3.5 text-blue-600" />,
        tool: <CodeBracketIcon className="w-3.5 h-3.5 text-orange-600" />,
        retriever: <CodeBracketIcon className="w-3.5 h-3.5 text-teal-600" />,
    };

    return (
        <div
            className={`group flex items-center py-2 px-4 hover:bg-panel-hover cursor-pointer border-l-2 border-transparent transition-colors ${isSelected ? 'bg-indigo-500/10 border-indigo-500' : ''}`}
            onClick={() => onSelect(span)}
        >
            <div className="flex-1 flex items-center overflow-hidden mr-4">
                <div style={{ paddingLeft: `${depth * 16}px` }} className="flex items-center gap-2 truncate">
                    <Tooltip content={
                        <span>
                            <span className="font-semibold text-indigo-400">{span.type.toUpperCase()}</span>
                            <span className="ml-1 text-gray-400">
                                {span.type === 'llm' ? 'Language Model' : span.type === 'chain' ? 'Workflow Chain' : span.type === 'tool' ? 'External Tool' : 'Context Retrieval'}
                            </span>
                        </span>
                    }>
                        <span className="opacity-70">
                            {iconMap[span.type]}
                        </span>
                    </Tooltip>

                    <span className={`text-sm truncate ${isSelected ? 'text-indigo-600 dark:text-indigo-400 font-semibold' : 'text-text-main'}`}>{span.name}</span>
                    <span className="text-[10px] text-text-muted border border-border-base px-1 rounded bg-app">{span.type}</span>
                </div>
            </div>

            {/* Waterfall visualization */}
            <div className="w-32 h-6 relative bg-border-base/30 rounded overflow-hidden flex-shrink-0">
                <div
                    className={`absolute top-1 bottom-1 rounded-sm opacity-80 ${span.status === 'error' ? 'bg-rose-500' : 'bg-indigo-500'}`}
                    style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
                />
            </div>

            <div className="w-16 text-right text-xs text-text-muted font-mono ml-4">
                {span.metrics.latency_ms}ms
            </div>
        </div>
    );
}

const JSONViewer = ({ data, label }: { data: any, label: string }) => (
    <div className="mb-6">
        <h4 className="text-xs uppercase tracking-wider text-text-muted font-semibold mb-2">{label}</h4>
        <div className="bg-app/50 border border-border-base rounded-md p-3 overflow-x-auto shadow-inner">
            <pre className="text-xs font-mono text-text-main whitespace-pre-wrap">
                {JSON.stringify(data, null, 2)}
            </pre>
        </div>
    </div>
);

const TraceDetail: React.FC<TraceDetailProps> = ({ trace, onClose }) => {
    const [selectedSpan, setSelectedSpan] = useState<Span>(trace.root_span);

    // Update selected span when the trace changes (e.g. user clicks a different row)
    useEffect(() => {
        setSelectedSpan(trace.root_span);
    }, [trace.id, trace.root_span]);

    const sortedSpans = useMemo(() => {
        return [...trace.spans].sort((a, b) => a.start_time - b.start_time);
    }, [trace.spans]);

    const minStart = trace.root_span.start_time;
    const totalDuration = trace.total_latency;

    return (
        <div className="h-full flex flex-col bg-panel border-l border-border-base text-text-main font-sans transition-colors duration-300">
            {/* Header */}
            <div className="h-14 border-b border-border-base flex items-center justify-between px-6 bg-app flex-shrink-0">
                <div className="flex items-center gap-4">
                    <button onClick={onClose} className="text-text-muted hover:text-text-main transition-colors">
                        <ChevronRightIcon className="w-5 h-5" />
                    </button>
                    <div className="flex flex-col">
                        <h2 className="text-sm font-bold text-text-main">{trace.root_span.name}</h2>
                        <div className="flex items-center gap-2 text-xs text-text-muted font-mono">
                            <span>{trace.id}</span>
                            <span>•</span>
                            <span>{new Date(trace.timestamp).toLocaleString()}</span>
                        </div>
                    </div>
                    {trace.status === 'error' && (
                        <span className="flex items-center gap-1 text-xs text-rose-600 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                            <ExclamationCircleIcon className="w-3 h-3" /> Error
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-4 text-xs">
                    <div className="flex flex-col items-end">
                        <span className="text-text-muted">Latency</span>
                        <span className="text-text-main font-mono font-medium">{trace.total_latency}ms</span>
                    </div>
                    <div className="flex flex-col items-end">
                        <span className="text-text-muted">Tokens</span>
                        <span className="text-text-main font-mono font-medium">{trace.total_tokens}</span>
                    </div>
                    <div className="flex flex-col items-end">
                        <span className="text-text-muted">Cost</span>
                        <span className="text-text-main font-mono font-medium">${trace.total_cost.toFixed(4)}</span>
                    </div>
                </div>
            </div>

            <div className="flex-1 flex min-h-0">
                {/* Left: Span List */}
                <div className="w-1/2 border-r border-border-base overflow-y-auto bg-app/50">
                    <div className="py-2">
                        {sortedSpans.map(span => (
                            <SpanRow
                                key={span.id}
                                span={span}
                                depth={span.parent_id ? 1 : 0}
                                isSelected={selectedSpan.id === span.id}
                                onSelect={setSelectedSpan}
                                minStart={minStart}
                                totalDuration={totalDuration}
                            />
                        ))}
                    </div>
                </div>

                {/* Right: Span Details */}
                <div className="w-1/2 overflow-y-auto bg-panel p-6">
                    <div className="mb-6 flex items-start justify-between">
                        <div>
                            <h3 className="text-lg font-bold text-text-main mb-1">{selectedSpan.name}</h3>
                            <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 rounded text-xs bg-app text-text-muted border border-border-base font-mono">
                                    {selectedSpan.type}
                                </span>
                                <span className="px-2 py-0.5 rounded text-xs bg-app text-text-muted border border-border-base font-mono">
                                    {selectedSpan.id}
                                </span>
                            </div>
                        </div>
                        {selectedSpan.metrics.cost !== undefined && selectedSpan.metrics.cost > 0 && (
                            <div className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded text-emerald-600 dark:text-emerald-400 text-xs font-mono font-medium">
                                ${selectedSpan.metrics.cost.toFixed(5)}
                            </div>
                        )}
                    </div>

                    {/* Attributes Grid */}
                    <div className="grid grid-cols-2 gap-4 mb-6">
                        {Object.entries(selectedSpan.attributes).map(([key, value]) => (
                            <div key={key} className="bg-app/50 p-3 rounded border border-border-base">
                                <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">{key.replace('_', ' ')}</div>
                                <div className="text-sm text-text-main font-mono truncate">
                                    {String(value)}
                                </div>
                            </div>
                        ))}
                        <div className="bg-app/50 p-3 rounded border border-border-base">
                            <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">Tokens</div>
                            <div className="text-sm text-text-main font-mono">
                                {selectedSpan.metrics.total_tokens || 0}
                            </div>
                        </div>
                    </div>

                    <JSONViewer data={selectedSpan.input} label="Input" />
                    <JSONViewer data={selectedSpan.output} label="Output" />

                    {selectedSpan.attributes.reasoning_enabled && (
                        <div className="mt-6 pt-6 border-t border-border-base">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                                <h4 className="text-sm font-semibold text-purple-600 dark:text-purple-400">Reasoning Details</h4>
                            </div>
                            <p className="text-xs text-text-muted mb-3">
                                This model used <span className="text-text-main font-medium">{selectedSpan.attributes.reasoning_effort}</span> effort.
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