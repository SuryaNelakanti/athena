import React, { useState, useMemo, useEffect } from 'react';
import type { Trace, Span, Dataset } from '../types';
import {
    ExclamationCircleIcon,
    ChevronRightIcon,
    PencilSquareIcon,
    HandThumbUpIcon,
    HandThumbDownIcon,
    InboxArrowDownIcon,
    AtSymbolIcon,
    LinkIcon,
    UserPlusIcon,
} from '@heroicons/react/24/outline';
import { Badge, Button, IconButton, Tooltip } from '../components/ui';
import { api } from '../lib/api';
import { getErrorMessage } from '../lib/errors';
import { PageHeader } from '../layouts/PageHeader';
import { TraceSpanWorkspace } from '../features/traces/TraceSpanWorkspace';
import { TraceCollaborationModal, type TraceCollaborationKind } from '../features/traces/TraceCollaborationModal';
import { extractSpanOutput, statusVariant } from '../features/traces/traceFormatting';
import { TraceLineagePanel } from '../features/traces/TraceLineagePanel';
import { TracePromoteModal, type TraceReviewAction } from '../features/traces/TracePromoteModal';
import { useTraceLineage } from '../features/traces/useTraceLineage';

interface TraceDetailProps {
    trace: Trace;
    onClose: () => void;
    onOpenTrace?: (traceId: string) => void;
}

const TraceDetail: React.FC<TraceDetailProps> = ({ trace, onClose, onOpenTrace }) => {
    const [selectedSpan, setSelectedSpan] = useState<Span>(trace.root_span);
    const [datasets, setDatasets] = useState<Dataset[]>([]);
    const [datasetsError, setDatasetsError] = useState<string | null>(null);
    const [isPromoting, setIsPromoting] = useState(false);
    const [reviewNotice, setReviewNotice] = useState<{ message: string; kind: 'success' | 'error' } | null>(null);
    const lineage = useTraceLineage(trace);

    // Correct & Add Modal State
    const [showCorrectModal, setShowCorrectModal] = useState(false);
    const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);
    const [correctedOutput, setCorrectedOutput] = useState('');
    const [actionType, setActionType] = useState<TraceReviewAction>('good');
    const [actionError, setActionError] = useState<string | null>(null);
    const [actionSuccess, setActionSuccess] = useState<string | null>(null);

    const [collabKind, setCollabKind] = useState<TraceCollaborationKind | null>(null);

    useEffect(() => {
        let active = true;
        setDatasetsError(null);
        api.getDatasets(trace.project_id)
            .then((items) => {
                if (active) setDatasets(items);
            })
            .catch((error: unknown) => {
                if (active) setDatasetsError(getErrorMessage(error, 'Unable to load datasets.'));
            });
        return () => {
            active = false;
        };
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
        } catch (e: unknown) {
            setActionError(getErrorMessage(e, 'Failed to add to dataset'));
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
        } catch (e: unknown) {
            setReviewNotice({ message: getErrorMessage(e, 'Failed to send to review queue'), kind: 'error' });
            setTimeout(() => setReviewNotice(null), 3000);
        }
    };

    const openCollab = (kind: TraceCollaborationKind) => setCollabKind(kind);

    useEffect(() => {
        setSelectedSpan(trace.root_span);
    }, [trace.id, trace.root_span]);


    return (
        <div className="h-full flex flex-col bg-panel border-l border-border-base text-text-main font-sans">
            {/* Header */}
            <div className="border-b border-border-hairline shrink-0">
                <PageHeader
                    title={trace.root_span.name}
                    subtitle={
                        <div className="flex items-center gap-2 text-xs text-text-muted mt-0.5">
                            <span className="font-mono">{trace.id.substring(0, 12)}...</span>
                            <span>•</span>
                            <span>{new Date(trace.timestamp).toLocaleString()}</span>
                        </div>
                    }
                    badge={trace.status === 'error' ? (
                        <Badge variant="danger" className="gap-1">
                            <ExclamationCircleIcon className="w-3 h-3" /> Error
                        </Badge>
                    ) : (
                        <Badge variant={statusVariant(trace.status)}>{trace.status}</Badge>
                    )}
                    actions={
                        <div className="flex items-center gap-2">
                            <IconButton onClick={onClose} variant="ghost" size="sm">
                                <ChevronRightIcon className="w-5 h-5" />
                            </IconButton>
                            <div className="h-4 w-px bg-border-base mx-1" />

                            <div className="flex bg-panel rounded-lg p-1 border border-border-base mr-2">
                                <Tooltip content="Assign">
                                    <IconButton variant="ghost" size="sm" onClick={() => openCollab('assignment')} aria-label="Assign">
                                        <UserPlusIcon className="w-4 h-4" />
                                    </IconButton>
                                </Tooltip>
                                <Tooltip content="Mention">
                                    <IconButton variant="ghost" size="sm" onClick={() => openCollab('mention')} aria-label="Mention">
                                        <AtSymbolIcon className="w-4 h-4" />
                                    </IconButton>
                                </Tooltip>
                                <Tooltip content="Share">
                                    <IconButton variant="ghost" size="sm" onClick={() => openCollab('share')} aria-label="Share">
                                        <LinkIcon className="w-4 h-4" />
                                    </IconButton>
                                </Tooltip>
                            </div>
                            <Button onClick={handleSendToReview} variant="secondary" size="sm">
                                <InboxArrowDownIcon className="w-4 h-4" />
                                Review
                            </Button>
                        </div>
                    }
                    className="pb-0 border-b-0"
                />

                {/* Metrics Strip */}
                <div className="px-6 py-3 flex items-center gap-6 text-sm bg-app/50 border-t border-border-hairline">
                    <div>
                        <span className="text-text-muted text-xs uppercase tracking-wider font-bold block mb-0.5">Latency</span>
                        <div className="font-medium tabular-nums">{trace.total_latency}ms</div>
                    </div>
                    <div>
                        <span className="text-text-muted text-xs uppercase tracking-wider font-bold block mb-0.5">Tokens</span>
                        <div className="font-medium tabular-nums">{trace.total_tokens}</div>
                    </div>
                    <div>
                        <span className="text-text-muted text-xs uppercase tracking-wider font-bold block mb-0.5">Cost</span>
                        <div className="font-medium tabular-nums">${trace.total_cost.toFixed(4)}</div>
                    </div>
                    <div className="flex-1" />
                    <div className="flex items-center gap-2">
                        <Button onClick={() => handleActionClick('good')} variant="ghost" size="sm" className="text-emerald-600 hover:bg-emerald-50">
                            <HandThumbUpIcon className="w-4 h-4" />
                            Good
                        </Button>
                        <Button onClick={() => handleActionClick('correct')} variant="ghost" size="sm" className="text-text-muted hover:text-text-main">
                            <PencilSquareIcon className="w-4 h-4" />
                            Correct
                        </Button>
                        <Button onClick={() => handleActionClick('bad')} variant="ghost" size="sm" className="text-rose-600 hover:bg-rose-50">
                            <HandThumbDownIcon className="w-4 h-4" />
                            Bad
                        </Button>
                    </div>
                </div>
            </div>

            <TraceLineagePanel trace={trace} {...lineage} onOpenTrace={onOpenTrace} />
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

            <TraceSpanWorkspace trace={trace} selectedSpan={selectedSpan} onSelectSpan={setSelectedSpan} />

            <TracePromoteModal
                open={showCorrectModal}
                actionType={actionType}
                actionError={actionError}
                actionSuccess={actionSuccess}
                datasetsError={datasetsError}
                datasets={datasets}
                selectedDatasetId={selectedDatasetId}
                correctedOutput={correctedOutput}
                currentOutput={currentOutput}
                isPromoting={isPromoting}
                onSelectDataset={setSelectedDatasetId}
                onCorrectedOutputChange={setCorrectedOutput}
                onClose={() => setShowCorrectModal(false)}
                onPromote={handlePromote}
            />

            <TraceCollaborationModal trace={trace} kind={collabKind} onClose={() => setCollabKind(null)} />
        </div>
    );
};

export default TraceDetail;
