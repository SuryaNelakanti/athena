import React, { useState, useMemo, useEffect } from 'react';
import { Trace, Span } from '../../types';
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
    InboxArrowDownIcon,
    AtSymbolIcon,
    LinkIcon,
    UserPlusIcon
} from '@heroicons/react/24/outline';
import { Badge, Button, Card, IconButton, Input, Modal, Select, Textarea, Tooltip } from '../ui';
import { api } from '../../services/api';
import { Dataset } from '../../types';

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
        llm: <ChatBubbleLeftRightIcon className="w-3.5 h-3.5 text-primary" />,
        chain: <CubeIcon className="w-3.5 h-3.5 text-primary" />,
        tool: <CodeBracketIcon className="w-3.5 h-3.5 text-amber-500" />,
        retriever: <CodeBracketIcon className="w-3.5 h-3.5 text-emerald-500" />,
    };

    return (
        <div
            className={`group flex items-center py-2.5 px-6 hover:bg-panel-hover cursor-pointer border-l-2 border-transparent transition-all duration-200 ${isSelected ? 'bg-primary/10 border-primary/20' : ''}`}
            onClick={() => onSelect(span)}
        >
            <div className="flex-1 flex items-center overflow-hidden mr-4">
                <div style={{ paddingLeft: `${depth * 16}px` }} className="flex items-center gap-2 truncate">
                    <Tooltip content={
                        <span>
                            <span className="font-semibold text-primary">{span.type.toUpperCase()}</span>
                            <span className="ml-1 text-text-muted">
                                {span.type === 'llm' ? 'Language Model' : span.type === 'chain' ? 'Workflow Chain' : span.type === 'tool' ? 'External Tool' : 'Context Retrieval'}
                            </span>
                        </span>
                    }>
                        <span className="opacity-70">
                            {iconMap[span.type]}
                        </span>
                    </Tooltip>

                    <span className={`text-sm truncate ${isSelected ? 'text-primary font-semibold' : 'text-text-main'}`}>{span.name}</span>
                    <span className="text-[10px] text-text-muted border border-border-base px-1 rounded bg-app">{span.type}</span>
                </div>
            </div>

            <div className="w-36 h-2 relative bg-border-base/40 rounded-full overflow-hidden flex-shrink-0">
                <div
                    className={`absolute top-0 bottom-0 rounded-full transition-all duration-300 ${span.status === 'error' ? 'bg-rose-500' : 'bg-primary'}`}
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
        <div className="bg-app border border-border-base rounded-md p-4 overflow-x-auto shadow-sm">
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

    const [collabKind, setCollabKind] = useState<'assignment' | 'mention' | 'share' | null>(null);
    const [collabAssignee, setCollabAssignee] = useState('');
    const [collabMention, setCollabMention] = useState('');
    const [collabNote, setCollabNote] = useState('');
    const [shareExpiry, setShareExpiry] = useState('');
    const [collabError, setCollabError] = useState<string | null>(null);
    const [collabMessage, setCollabMessage] = useState<string | null>(null);
    const [collabBusy, setCollabBusy] = useState(false);
    const [shareToken, setShareToken] = useState<string | null>(null);

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

    const openCollab = (kind: 'assignment' | 'mention' | 'share') => {
        setCollabKind(kind);
        setCollabAssignee('');
        setCollabMention('');
        setCollabNote('');
        setShareExpiry('');
        setCollabError(null);
        setCollabMessage(null);
        setShareToken(null);
    };

    const closeCollab = () => {
        setCollabKind(null);
        setCollabError(null);
        setCollabMessage(null);
        setCollabBusy(false);
        setShareToken(null);
    };

    const handleCollabSubmit = async () => {
        if (!collabKind) return;
        setCollabError(null);
        setCollabMessage(null);
        setCollabBusy(true);
        try {
            if (collabKind === 'assignment') {
                if (!collabAssignee.trim()) {
                    setCollabError('Assignee is required.');
                    return;
                }
                await api.createAssignment({
                    project_id: trace.project_id,
                    object_type: 'trace',
                    object_id: trace.id,
                    assignee: collabAssignee.trim(),
                    note: collabNote.trim() || undefined,
                });
                setCollabMessage('Assignment created.');
            }
            if (collabKind === 'mention') {
                if (!collabMention.trim()) {
                    setCollabError('Mention target is required.');
                    return;
                }
                await api.createMention({
                    project_id: trace.project_id,
                    object_type: 'trace',
                    object_id: trace.id,
                    mentioned: collabMention.trim(),
                    note: collabNote.trim() || undefined,
                });
                setCollabMessage('Mention created.');
            }
            if (collabKind === 'share') {
                const expiresAt = shareExpiry ? new Date(shareExpiry).getTime() : undefined;
                const created = await api.createShareLink({
                    project_id: trace.project_id,
                    object_type: 'trace',
                    object_id: trace.id,
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

    const copyShareToken = async () => {
        if (!shareToken || !navigator.clipboard) return;
        await navigator.clipboard.writeText(shareToken);
        setCollabMessage('Share token copied.');
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
        <div className="h-full flex flex-col bg-panel border-l border-border-base text-text-main font-sans">
            {/* Header - Row 1: Title & Close */}
            <div className="px-6 py-4 border-b border-border-hairline flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <IconButton onClick={onClose} variant="ghost" size="sm">
                        <ChevronRightIcon className="w-5 h-5" />
                    </IconButton>
                    <div>
                        <h2 className="text-xl font-serif font-bold text-text-main">{trace.root_span.name}</h2>
                        <div className="flex items-center gap-2 text-xs text-text-muted mt-0.5">
                            <span>{trace.id.substring(0, 12)}...</span>
                            <span>•</span>
                            <span>{new Date(trace.timestamp).toLocaleString()}</span>
                        </div>
                    </div>
                </div>
                {trace.status === 'error' && (
                    <Badge variant="danger" className="gap-1">
                        <ExclamationCircleIcon className="w-3 h-3" /> Error
                    </Badge>
                )}
            </div>

            {/* Header - Row 2: Metrics */}
            <div className="px-6 py-3 border-b border-border-hairline flex items-center gap-6 text-sm">
                <div>
                    <span className="text-text-muted text-xs">Latency</span>
                    <div className="font-medium tabular-nums">{trace.total_latency}ms</div>
                </div>
                <div>
                    <span className="text-text-muted text-xs">Tokens</span>
                    <div className="font-medium tabular-nums">{trace.total_tokens}</div>
                </div>
                <div>
                    <span className="text-text-muted text-xs">Cost</span>
                    <div className="font-medium tabular-nums">${trace.total_cost.toFixed(4)}</div>
                </div>
            </div>

            {/* Header - Row 3: Actions */}
            <div className="px-6 py-3 border-b border-border-base flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1 mr-2">
                    <IconButton title="Assign" variant="ghost" size="sm" onClick={() => openCollab('assignment')}>
                        <UserPlusIcon className="w-4 h-4" />
                    </IconButton>
                    <IconButton title="Mention" variant="ghost" size="sm" onClick={() => openCollab('mention')}>
                        <AtSymbolIcon className="w-4 h-4" />
                    </IconButton>
                    <IconButton title="Share" variant="ghost" size="sm" onClick={() => openCollab('share')}>
                        <LinkIcon className="w-4 h-4" />
                    </IconButton>
                </div>
                <Button onClick={handleSendToReview} variant="secondary" size="sm">
                    <InboxArrowDownIcon className="w-4 h-4" />
                    Review
                </Button>
                <div className="flex-1" />
                <Button onClick={() => handleActionClick('good')} variant="success" size="sm">
                    <HandThumbUpIcon className="w-4 h-4" />
                    Good
                </Button>
                <Button onClick={() => handleActionClick('correct')} variant="secondary" size="sm">
                    <PencilSquareIcon className="w-4 h-4" />
                    Correct
                </Button>
                <Button onClick={() => handleActionClick('bad')} variant="danger" size="sm">
                    <HandThumbDownIcon className="w-4 h-4" />
                    Bad
                </Button>
            </div>

            {reviewNotice && (
                <div
                    className={`px-6 py-2 text-xs font-bold border-b ${reviewNotice.kind === 'success'
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'
                        : 'bg-rose-500/10 border-rose-500/20 text-rose-500'
                        }`}
                >
                    {reviewNotice.message}
                </div>
            )}

            <div className="flex-1 flex min-h-0">
                {/* Left: Span List */}
                <div className="w-1/2 border-r border-border-base overflow-y-auto">
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
                            <div className="px-4 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-md text-emerald-600 dark:text-emerald-400 text-xs font-bold shadow-sm shadow-emerald-500/10">
                                ${selectedSpan.metrics.cost.toFixed(5)}
                            </div>
                        )}
                    </div>

                    {/* Attributes Grid */}
                    <div className="grid grid-cols-2 gap-4 mb-8">
                        {Object.entries(selectedSpan.attributes).map(([key, value]) => (
                            <div key={key} className="bg-app border border-border-base p-4 rounded-md hover:border-border-hover transition-all group">
                                <div className="text-[9px] text-text-muted uppercase tracking-widest mb-1.5 font-bold opacity-60 group-hover:opacity-100 transition-opacity">{key.replace('_', ' ')}</div>
                                <div className="text-sm text-text-main font-semibold truncate">
                                    {String(value)}
                                </div>
                            </div>
                        ))}
                        <div className="bg-app border border-border-base p-4 rounded-md hover:border-border-hover transition-all group">
                            <div className="text-[9px] text-text-muted uppercase tracking-widest mb-1.5 font-bold opacity-60 group-hover:opacity-100 transition-opacity">Tokens</div>
                            <div className="text-sm text-text-main font-semibold">
                                {selectedSpan.metrics.total_tokens || 0}
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
                                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-500/30 rounded-md p-4 overflow-x-auto shadow-sm">
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
                    <div className="bg-panel border border-border-base rounded-lg shadow-lg w-full max-w-lg">
                        <div className={`p-6 border-b rounded-t-lg ${actionType === 'good' ? 'border-emerald-500/30 bg-emerald-500/5' :
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
                                <div className="text-xs text-rose-500 font-bold bg-rose-500/10 rounded-md p-3">{actionError}</div>
                            )}
                            {actionSuccess && (
                                <div className="text-xs text-emerald-500 font-bold bg-emerald-500/10 rounded-md p-3 flex items-center gap-2">
                                    <CheckCircleIcon className="w-4 h-4" /> {actionSuccess}
                                </div>
                            )}

                            {/* Dataset Selection */}
                            <div>
                                <label className="block text-[11px] font-medium text-text-muted mb-2">Select Dataset</label>
                                <Select
                                    value={selectedDatasetId || ''}
                                    onChange={(e) => setSelectedDatasetId(e.target.value)}
                                >
                                    <option value="">Choose a dataset...</option>
                                    {datasets.map(ds => (
                                        <option key={ds.id} value={ds.id}>{ds.name}</option>
                                    ))}
                                </Select>
                            </div>

                            {/* Show current output preview */}
                            <div>
                                <label className="block text-[11px] font-medium text-text-muted mb-2">Current Output</label>
                                <div className="bg-app border border-border-base rounded-md p-3 text-xs text-text-main max-h-24 overflow-y-auto">
                                    {currentOutput || '(No output)'}
                                </div>
                            </div>

                            {/* Correction textarea (only for correct action) */}
                            {actionType === 'correct' && (
                                <div>
                                    <label className="block text-[11px] font-medium text-emerald-600 mb-2">
                                        Corrected Expected Output
                                    </label>
                                    <Textarea
                                        value={correctedOutput}
                                        onChange={(e) => setCorrectedOutput(e.target.value)}
                                        className="bg-emerald-500/5 border-emerald-500/30 focus:ring-emerald-500/20 h-32 resize-none"
                                        placeholder="Enter the correct expected output..."
                                    />
                                </div>
                            )}

                            <div className="flex gap-4 pt-2">
                                <Button
                                    variant="secondary"
                                    className="flex-1"
                                    onClick={() => setShowCorrectModal(false)}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handlePromote}
                                    disabled={isPromoting || !selectedDatasetId}
                                    variant={actionType === 'good' ? 'success' : actionType === 'correct' ? 'secondary' : 'danger'}
                                    className="flex-1"
                                >
                                    {isPromoting ? 'Adding...' :
                                        actionType === 'good' ? 'Add as Gold' :
                                            actionType === 'correct' ? 'Add Corrected' :
                                                'Add as Anti-Pattern'
                                    }
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <Modal
                open={!!collabKind}
                title={
                    collabKind === 'assignment'
                        ? 'Create assignment'
                        : collabKind === 'mention'
                            ? 'Create mention'
                            : 'Create share link'
                }
                description="Attach collaboration context to this trace."
                onClose={closeCollab}
                footer={
                    <div className="flex items-center justify-end gap-2">
                        <Button variant="secondary" size="sm" onClick={closeCollab}>
                            Cancel
                        </Button>
                        <Button variant="primary" size="sm" onClick={handleCollabSubmit} disabled={collabBusy}>
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

                    <div>
                        <label className="block text-[11px] font-medium text-text-muted">Object</label>
                        <div className="mt-1 rounded-md border border-border-base bg-app px-3 py-2 text-xs text-text-muted">
                            trace · {trace.id}
                        </div>
                    </div>

                    {collabKind === 'assignment' && (
                        <>
                            <div>
                                <label className="block text-[11px] font-medium text-text-muted">Assignee</label>
                                <Input
                                    value={collabAssignee}
                                    onChange={(e) => setCollabAssignee(e.target.value)}
                                    placeholder="name@company.com"
                                    className="mt-1"
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-medium text-text-muted">Note</label>
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

                    {collabKind === 'mention' && (
                        <>
                            <div>
                                <label className="block text-[11px] font-medium text-text-muted">Mention</label>
                                <Input
                                    value={collabMention}
                                    onChange={(e) => setCollabMention(e.target.value)}
                                    placeholder="name@company.com"
                                    className="mt-1"
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-medium text-text-muted">Note</label>
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

                    {collabKind === 'share' && (
                        <>
                            <div>
                                <label className="block text-[11px] font-medium text-text-muted">Expires At</label>
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

export default TraceDetail;

