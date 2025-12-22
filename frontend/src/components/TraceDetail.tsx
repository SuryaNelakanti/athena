import React, { useState, useMemo, useEffect } from 'react';
import { Trace, Span } from '../types';
import {
    CodeBracketIcon,
    CheckCircleIcon,
    ExclamationCircleIcon,
    ChevronRightIcon,
    CubeIcon,
    ChatBubbleLeftRightIcon,
    PencilSquareIcon,
    HandThumbUpIcon,
    HandThumbDownIcon,
    InboxArrowDownIcon
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

            <div className="w-36 h-2 relative bg-border-base/40 rounded-full overflow-hidden flex-shrink-0">
                <div
                    className={`absolute top-0 bottom-0 rounded-full transition-all duration-300 ${span.status === 'error' ? 'bg-rose-500' : 'bg-wispr-purple'}`}
                    style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
                />
            </div>

            <div className="w-16 text-right text-xs text-text-muted ml-4 tabular-nums">
                {span.metrics.latency_ms}ms
            </div>
        </div>
    );
}

const JSONViewer = ({ data, label }: { data: any, label: string }) => (
    <details className="mb-6 group">
        <summary className="cursor-pointer text-[10px] uppercase tracking-widest text-text-muted font-bold mb-2 opacity-70 group-open:opacity-100">
            Raw {label}
        </summary>
        <div className="bg-app border border-border-base rounded-2xl p-4 overflow-x-auto shadow-sm">
            <pre className="text-[12px] text-text-main whitespace-pre-wrap leading-relaxed">
                {JSON.stringify(data, null, 2)}
            </pre>
        </div>
    </details>
);

// Extract readable output from span
const extractSpanOutput = (span: Span): string => {
    const output = span.output;
    if (typeof output === 'string') return output;
    if (!output || typeof output !== 'object') return '';
    for (const key of ['output_text', 'text', 'content', 'value', 'response', 'answer']) {
        if (typeof output[key] === 'string') return output[key];
    }
    return JSON.stringify(output);
};

const extractSpanInput = (span: Span): string => {
    const input = span.input;
    if (typeof input === 'string') return input;
    if (!input || typeof input !== 'object') return '';
    for (const key of ['prompt', 'input', 'text', 'query', 'question', 'content']) {
        if (typeof input[key] === 'string') return input[key];
    }
    if (Array.isArray(input.messages)) {
        const userMsg = input.messages.find((m: any) => m.role === 'user');
        if (userMsg?.content) return userMsg.content;
    }
    return JSON.stringify(input);
};

const truncateText = (value: string, maxLength: number = 180) => {
    if (!value) return '';
    if (value.length <= maxLength) return value;
    return `${value.slice(0, maxLength).trimEnd()}...`;
};

const TraceDetail: React.FC<TraceDetailProps> = ({ trace, onClose }) => {
    const [selectedSpan, setSelectedSpan] = useState<Span>(trace.root_span);
    const [datasets, setDatasets] = useState<Dataset[]>([]);
    const [isPromoting, setIsPromoting] = useState(false);
    const [reviewNotice, setReviewNotice] = useState<{ message: string; kind: 'success' | 'error' } | null>(null);

    // Correct & Add Modal State
    const [showCorrectModal, setShowCorrectModal] = useState(false);
    const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);
    const [correctedOutput, setCorrectedOutput] = useState('');
    const [actionType, setActionType] = useState<'good' | 'correct' | 'bad'>('good');
    const [actionError, setActionError] = useState<string | null>(null);
    const [actionSuccess, setActionSuccess] = useState<string | null>(null);

    useEffect(() => {
        api.getDatasets(trace.project_id).then(setDatasets).catch(console.error);
    }, [trace.project_id]);

    // Get the output text for editing
    const currentOutput = useMemo(() => {
        const lastSpan = trace.spans[trace.spans.length - 1] || trace.root_span;
        return extractSpanOutput(lastSpan);
    }, [trace.spans, trace.root_span]);

    const handleActionClick = (type: 'good' | 'correct' | 'bad') => {
        setActionType(type);
        setActionError(null);
        setActionSuccess(null);

        if (type === 'correct') {
            setCorrectedOutput(currentOutput);
            setShowCorrectModal(true);
        } else {
            setShowCorrectModal(true);
        }
    };

    const handlePromote = async () => {
        if (!selectedDatasetId) {
            setActionError('Please select a dataset');
            return;
        }

        setIsPromoting(true);
        setActionError(null);

        try {
            if (actionType === 'correct' || actionType === 'bad') {
                await api.promoteToDataset(trace.id, selectedDatasetId, {
                    corrected_expected: actionType === 'correct' ? { answer: correctedOutput } : undefined,
                    example_type: actionType === 'bad' ? 'anti_pattern' : 'gold'
                });
            } else {
                await api.promoteToDataset(trace.id, selectedDatasetId);
            }

            const successMsg = actionType === 'good'
                ? 'Added as gold example!'
                : actionType === 'correct'
                    ? 'Added with correction!'
                    : 'Added as anti-pattern!';
            setActionSuccess(successMsg);

            setTimeout(() => {
                setShowCorrectModal(false);
                setActionSuccess(null);
            }, 1500);
        } catch (e: any) {
            setActionError(e?.message || 'Failed to add to dataset');
        } finally {
            setIsPromoting(false);
        }
    };

    const handleSendToReview = async () => {
        setReviewNotice(null);
        try {
            await api.createReviewFromTrace({ trace_id: trace.id, project_id: trace.project_id });
            setReviewNotice({ message: 'Sent to review queue', kind: 'success' });
            setTimeout(() => setReviewNotice(null), 2000);
        } catch (e: any) {
            setReviewNotice({ message: e?.message || 'Failed to send to review queue', kind: 'error' });
            setTimeout(() => setReviewNotice(null), 3000);
        }
    };

    useEffect(() => {
        setSelectedSpan(trace.root_span);
    }, [trace.id, trace.root_span]);

    const { orderedSpans, depthMap } = useMemo(() => {
        const spanMap = new Map<string, Span>();
        trace.spans.forEach(s => spanMap.set(s.id, s));

        const childrenMap = new Map<string | null, Span[]>();
        trace.spans.forEach(s => {
            const parentId = s.parent_id || null;
            if (!childrenMap.has(parentId)) {
                childrenMap.set(parentId, []);
            }
            childrenMap.get(parentId)!.push(s);
        });

        childrenMap.forEach((children) => {
            children.sort((a, b) => a.start_time - b.start_time);
        });

        const orderedSpans: Span[] = [];
        const depthMap = new Map<string, number>();

        const traverse = (parentId: string | null, depth: number) => {
            const children = childrenMap.get(parentId) || [];
            for (const child of children) {
                orderedSpans.push(child);
                depthMap.set(child.id, depth);
                traverse(child.id, depth + 1);
            }
        };

        traverse(null, 0);

        return { orderedSpans, depthMap };
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
                        <span className="text-text-main font-medium tabular-nums">{trace.total_latency}ms</span>
                    </div>
                    <div className="flex flex-col items-end">
                        <span className="text-text-muted">Tokens</span>
                        <span className="text-text-main font-medium tabular-nums">{trace.total_tokens}</span>
                    </div>
                    <div className="flex flex-col items-end">
                        <span className="text-text-muted">Cost</span>
                        <span className="text-text-main font-medium tabular-nums">${trace.total_cost.toFixed(4)}</span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 ml-4 flex-wrap">
                        <button
                            onClick={handleSendToReview}
                            className="flex items-center gap-2 px-4 py-2 bg-panel border border-border-base rounded-xl text-[10px] font-bold tracking-wider text-text-main hover:bg-panel-hover transition-all"
                        >
                            <InboxArrowDownIcon className="w-4 h-4 text-amber-500" />
                            SEND TO REVIEW
                        </button>

                        <button
                            onClick={() => handleActionClick('good')}
                            className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 rounded-xl text-[10px] font-bold tracking-wider hover:bg-emerald-500/20 transition-all"
                        >
                            <HandThumbUpIcon className="w-4 h-4" />
                            GOOD EXAMPLE
                        </button>
                        <button
                            onClick={() => handleActionClick('correct')}
                            className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 text-amber-600 border border-amber-500/20 rounded-xl text-[10px] font-bold tracking-wider hover:bg-amber-500/20 transition-all"
                        >
                            <PencilSquareIcon className="w-4 h-4" />
                            CORRECT & ADD
                        </button>
                        <button
                            onClick={() => handleActionClick('bad')}
                            className="flex items-center gap-2 px-3 py-2 bg-rose-500/10 text-rose-600 border border-rose-500/20 rounded-xl text-[10px] font-bold tracking-wider hover:bg-rose-500/20 transition-all"
                        >
                            <HandThumbDownIcon className="w-4 h-4" />
                            BAD EXAMPLE
                        </button>
                    </div>
                </div>
            </div>

            {reviewNotice && (
                <div
                    className={`px-8 py-2 text-xs font-bold border-b ${
                        reviewNotice.kind === 'success'
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'
                            : 'bg-rose-500/10 border-rose-500/20 text-rose-500'
                    }`}
                >
                    {reviewNotice.message}
                </div>
            )}

            <div className="flex-1 flex min-h-0">
                {/* Left: Span List */}
                <div className="w-1/2 border-r border-border-base overflow-y-auto bg-app/50">
                    <div className="py-2">
                        {orderedSpans.map(span => (
                            <SpanRow
                                key={span.id}
                                span={span}
                                depth={depthMap.get(span.id) || 0}
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
                                <span className="px-2.5 py-1 rounded-lg text-[10px] bg-app text-text-muted border border-border-base opacity-60">
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

                    {/* Summary Preview */}
                    <div className="grid grid-cols-2 gap-4 mb-8">
                        <div className="bg-app border border-border-base p-4 rounded-2xl">
                            <div className="text-[9px] uppercase tracking-widest text-text-muted font-bold mb-2">Input Preview</div>
                            <div className="text-sm text-text-main font-medium whitespace-pre-wrap">
                                {truncateText(extractSpanInput(selectedSpan)) || 'No input captured.'}
                            </div>
                        </div>
                        <div className="bg-app border border-border-base p-4 rounded-2xl">
                            <div className="text-[9px] uppercase tracking-widest text-text-muted font-bold mb-2">Output Preview</div>
                            <div className="text-sm text-text-main font-medium whitespace-pre-wrap">
                                {truncateText(extractSpanOutput(selectedSpan)) || 'No output captured.'}
                            </div>
                        </div>
                    </div>

                    <JSONViewer data={selectedSpan.input} label="Input" />

                    {/* Reasoning Section - Check both output and attributes for reasoning content */}
                    {(selectedSpan.output?.athena_reasoning ||
                        selectedSpan.output?.reasoning ||
                        selectedSpan.attributes?.reasoning_content) && (
                            <div className="mb-8">
                                <h4 className="text-[10px] uppercase tracking-widest text-amber-600 dark:text-amber-400 font-bold mb-3 flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                                    Model Reasoning
                                    {selectedSpan.attributes?.reasoning_enabled && (
                                        <span className="text-[9px] px-2 py-0.5 bg-amber-500/20 rounded-lg ml-2">
                                            Extended Thinking
                                        </span>
                                    )}
                                </h4>
                                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-500/30 rounded-2xl p-4 overflow-x-auto shadow-sm">
                                    <pre className="text-[12px] text-amber-900 dark:text-amber-100 whitespace-pre-wrap leading-relaxed">
                                        {selectedSpan.attributes?.reasoning_content ||
                                            selectedSpan.output?.athena_reasoning ||
                                            selectedSpan.output?.reasoning}
                                    </pre>
                                </div>
                            </div>
                        )}

                    <JSONViewer data={selectedSpan.output} label="Output" />
                </div>
            </div>

            {/* Promote Modal */}
            {showCorrectModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-panel border border-border-base rounded-3xl shadow-2xl w-full max-w-lg">
                        <div className={`p-6 border-b rounded-t-3xl ${actionType === 'good' ? 'border-emerald-500/30 bg-emerald-500/5' :
                            actionType === 'correct' ? 'border-amber-500/30 bg-amber-500/5' :
                                'border-rose-500/30 bg-rose-500/5'
                            }`}>
                            <h3 className="text-lg font-serif font-black text-text-main flex items-center gap-2">
                                {actionType === 'good' && <><HandThumbUpIcon className="w-5 h-5 text-emerald-500" /> Add as Good Example</>}
                                {actionType === 'correct' && <><PencilSquareIcon className="w-5 h-5 text-amber-500" /> Correct & Add</>}
                                {actionType === 'bad' && <><HandThumbDownIcon className="w-5 h-5 text-rose-500" /> Mark as Bad Example</>}
                            </h3>
                            <p className="text-xs text-text-muted mt-1">
                                {actionType === 'good' && 'This trace will be added as a gold example (correct behavior).'}
                                {actionType === 'correct' && 'Edit the expected output before adding to the dataset.'}
                                {actionType === 'bad' && 'This trace will be added as an anti-pattern (behavior to avoid).'}
                            </p>
                        </div>
                        <div className="p-6 space-y-4">
                            {actionError && (
                                <div className="text-xs text-rose-500 font-bold bg-rose-500/10 rounded-xl p-3">{actionError}</div>
                            )}
                            {actionSuccess && (
                                <div className="text-xs text-emerald-500 font-bold bg-emerald-500/10 rounded-xl p-3 flex items-center gap-2">
                                    <CheckCircleIcon className="w-4 h-4" /> {actionSuccess}
                                </div>
                            )}

                            {/* Dataset Selection */}
                            <div>
                                <label className="block text-[10px] font-bold uppercase tracking-widest text-text-muted mb-2">Select Dataset</label>
                                <select
                                    value={selectedDatasetId || ''}
                                    onChange={(e) => setSelectedDatasetId(e.target.value)}
                                    className="w-full bg-app border border-border-base rounded-xl px-4 py-3 text-sm text-text-main"
                                >
                                    <option value="">Choose a dataset...</option>
                                    {datasets.map(ds => (
                                        <option key={ds.id} value={ds.id}>{ds.name}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Show current output preview */}
                            <div>
                                <label className="block text-[10px] font-bold uppercase tracking-widest text-text-muted mb-2">Current Output</label>
                                <div className="bg-app border border-border-base rounded-xl p-3 text-xs text-text-main max-h-24 overflow-y-auto">
                                    {currentOutput || '(No output)'}
                                </div>
                            </div>

                            {/* Correction textarea (only for correct action) */}
                            {actionType === 'correct' && (
                                <div>
                                    <label className="block text-[10px] font-bold uppercase tracking-widest text-emerald-500 mb-2">
                                        Corrected Expected Output
                                    </label>
                                    <textarea
                                        value={correctedOutput}
                                        onChange={(e) => setCorrectedOutput(e.target.value)}
                                        className="w-full bg-emerald-500/5 border border-emerald-500/30 rounded-xl px-4 py-3 text-sm text-text-main h-32 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                                        placeholder="Enter the correct expected output..."
                                    />
                                </div>
                            )}

                            <div className="flex gap-4 pt-2">
                                <button
                                    onClick={() => setShowCorrectModal(false)}
                                    className="flex-1 px-4 py-3 bg-app border border-border-base rounded-xl text-sm font-bold text-text-muted hover:text-text-main transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handlePromote}
                                    disabled={isPromoting || !selectedDatasetId}
                                    className={`flex-1 px-4 py-3 text-white rounded-xl text-sm font-bold shadow-lg transition-all disabled:opacity-50 ${actionType === 'good' ? 'bg-emerald-500 shadow-emerald-500/20 hover:bg-emerald-600' :
                                        actionType === 'correct' ? 'bg-amber-500 shadow-amber-500/20 hover:bg-amber-600' :
                                            'bg-rose-500 shadow-rose-500/20 hover:bg-rose-600'
                                        }`}
                                >
                                    {isPromoting ? 'Adding...' :
                                        actionType === 'good' ? 'Add as Gold' :
                                            actionType === 'correct' ? 'Add Corrected' :
                                                'Add as Anti-Pattern'
                                    }
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TraceDetail;
