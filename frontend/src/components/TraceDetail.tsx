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
    ChatBubbleLeftRightIcon,
    PlusCircleIcon
} from '@heroicons/react/24/outline';
import { Tooltip } from './Tooltip';
import { api } from '../services/api';
import { Dataset } from '../types';

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
        llm: <ChatBubbleLeftRightIcon className="w-3.5 h-3.5 text-wispr-purple" />,
        chain: <CubeIcon className="w-3.5 h-3.5 text-blue-500" />,
        tool: <CodeBracketIcon className="w-3.5 h-3.5 text-amber-500" />,
        retriever: <CodeBracketIcon className="w-3.5 h-3.5 text-emerald-500" />,
    };

    return (
        <div
            className={`group flex items-center py-2.5 px-6 hover:bg-panel-hover cursor-pointer border-l-2 border-transparent transition-all duration-200 ${isSelected ? 'bg-wispr-purple/10 border-wispr-purple' : ''}`}
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
            <div className="w-36 h-2 relative bg-border-base/40 rounded-full overflow-hidden flex-shrink-0">
                <div
                    className={`absolute top-0 bottom-0 rounded-full transition-all duration-300 ${span.status === 'error' ? 'bg-rose-500' : 'bg-wispr-purple'}`}
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
    <div className="mb-8">
        <h4 className="text-[10px] uppercase tracking-widest text-text-muted font-bold mb-3 opacity-60">{label}</h4>
        <div className="bg-app border border-border-base rounded-2xl p-4 overflow-x-auto shadow-sm">
            <pre className="text-[12px] font-mono text-text-main whitespace-pre-wrap leading-relaxed">
                {JSON.stringify(data, null, 2)}
            </pre>
        </div>
    </div>
);

const TraceDetail: React.FC<TraceDetailProps> = ({ trace, onClose }) => {
    const [selectedSpan, setSelectedSpan] = useState<Span>(trace.root_span);
    const [datasets, setDatasets] = useState<Dataset[]>([]);
    const [isPromoting, setIsPromoting] = useState(false);
    const [showDatasetPicker, setShowDatasetPicker] = useState(false);

    useEffect(() => {
        api.getDatasets(trace.project_id).then(setDatasets).catch(console.error);
    }, [trace.project_id]);

    const handlePromote = async (datasetId: string) => {
        setIsPromoting(true);
        try {
            await api.promoteToDataset(trace.id, datasetId);
            alert("Successfully added to dataset!");
            setShowDatasetPicker(false);
        } catch (e) {
            console.error(e);
            alert("Failed to add to dataset.");
        } finally {
            setIsPromoting(false);
        }
    };

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
            <div className="h-20 border-b border-border-base flex items-center justify-between px-8 bg-app flex-shrink-0">
                <div className="flex items-center gap-6">
                    <button onClick={onClose} className="p-2 -ml-2 rounded-xl text-text-muted hover:text-text-main hover:bg-panel-hover transition-all">
                        <ChevronRightIcon className="w-5 h-5" />
                    </button>
                    <div className="flex flex-col">
                        <h2 className="text-lg font-serif font-black text-text-main leading-tight">{trace.root_span.name}</h2>
                        <div className="flex items-center gap-3 text-xs text-text-muted font-medium mt-0.5">
                            <span className="opacity-70">{trace.id.substring(0, 8)}...</span>
                            <span className="w-1 h-1 rounded-full bg-border-hover"></span>
                            <span>{new Date(trace.timestamp).toLocaleTimeString()}</span>
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

                    <div className="relative ml-4">
                        <button
                            onClick={() => setShowDatasetPicker(!showDatasetPicker)}
                            className="flex items-center gap-2 px-4 py-2 bg-wispr-purple/10 text-wispr-purple border border-wispr-purple/20 rounded-xl text-[10px] font-bold tracking-wider hover:bg-wispr-purple hover:text-white transition-all shadow-sm"
                        >
                            <PlusCircleIcon className="w-4 h-4" />
                            ADD TO DATASET
                        </button>

                        {showDatasetPicker && (
                            <div className="absolute right-0 top-full mt-2 w-48 bg-panel border border-border-base rounded-xl shadow-xl z-50 py-1 overflow-hidden">
                                <div className="px-3 py-2 text-[10px] uppercase tracking-widest text-text-muted font-bold border-b border-border-base/50">Select Dataset</div>
                                {datasets.length === 0 && (
                                    <div className="px-3 py-4 text-xs text-text-muted italic text-center">No datasets found for this project</div>
                                )}
                                {datasets.map(ds => (
                                    <button
                                        key={ds.id}
                                        onClick={() => handlePromote(ds.id)}
                                        disabled={isPromoting}
                                        className="w-full text-left px-3 py-2 hover:bg-wispr-purple/10 hover:text-wispr-purple text-xs font-medium transition-colors disabled:opacity-50"
                                    >
                                        {ds.name}
                                    </button>
                                ))}
                            </div>
                        )}
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
                <div className="w-1/2 overflow-y-auto bg-panel p-8">
                    <div className="mb-8 flex items-start justify-between">
                        <div>
                            <h3 className="text-2xl font-serif font-black text-text-main mb-2">{selectedSpan.name}</h3>
                            <div className="flex items-center gap-2">
                                <span className="px-2.5 py-1 rounded-lg text-[10px] bg-app text-text-muted border border-border-base font-bold uppercase tracking-widest">
                                    {selectedSpan.type}
                                </span>
                                <span className="px-2.5 py-1 rounded-lg text-[10px] bg-app text-text-muted border border-border-base font-mono opacity-60">
                                    {selectedSpan.id}
                                </span>
                            </div>
                        </div>
                        {selectedSpan.metrics.cost !== undefined && selectedSpan.metrics.cost > 0 && (
                            <div className="px-4 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-600 dark:text-emerald-400 text-xs font-bold shadow-sm shadow-emerald-500/10">
                                ${selectedSpan.metrics.cost.toFixed(5)}
                            </div>
                        )}
                    </div>

                    {/* Attributes Grid */}
                    <div className="grid grid-cols-2 gap-4 mb-8">
                        {Object.entries(selectedSpan.attributes).map(([key, value]) => (
                            <div key={key} className="bg-app border border-border-base p-4 rounded-2xl hover:border-border-hover transition-all group">
                                <div className="text-[9px] text-text-muted uppercase tracking-widest mb-1.5 font-bold opacity-60 group-hover:opacity-100 transition-opacity">{key.replace('_', ' ')}</div>
                                <div className="text-sm text-text-main font-semibold truncate">
                                    {String(value)}
                                </div>
                            </div>
                        ))}
                        <div className="bg-app border border-border-base p-4 rounded-2xl hover:border-border-hover transition-all group">
                            <div className="text-[9px] text-text-muted uppercase tracking-widest mb-1.5 font-bold opacity-60 group-hover:opacity-100 transition-opacity">Tokens</div>
                            <div className="text-sm text-text-main font-semibold">
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