import React, { useMemo, useState } from 'react';
import { Badge, Button } from '../../components/ui';
import { PageHeader } from '../../layouts/PageHeader';
import RunGraphComponent from './RunGraph';
import TimelineCard from './TimelineCard';
import RunNodeInspector from './RunNodeInspector';
import { statusVariant } from './runNarrativeUtils';
import { RunEvaluationPanels } from './RunEvaluationPanels';
import { useRunNarrativeData } from './useRunNarrativeData';
import {
    ExclamationTriangleIcon,
    PlayCircleIcon,
    DocumentTextIcon,
    ListBulletIcon,
    CpuChipIcon
} from '@heroicons/react/24/outline';

interface RunNarrativeProps {
    runId: string;
    onBack: (sessionId?: string) => void;
    onOpenTrace?: (traceId: string) => void;
}

const RunNarrative: React.FC<RunNarrativeProps> = ({ runId, onBack, onOpenTrace }) => {
    const {
        run,
        graph,
        graphError,
        loading,
        error,
        retryLoad,
        sessionEval,
        evalLoading,
        evalRunning,
        evalError,
        evalExpected,
        setEvalExpected,
        evalCriteria,
        setEvalCriteria,
        evalUseJudge,
        setEvalUseJudge,
        runEvaluation,
        evalScoreEntries,
        flaggedNodeIds,
    } = useRunNarrativeData(runId);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'timeline' | 'graph'>('timeline');
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

    const sortedNodes = useMemo(() => {
        if (!graph?.nodes) return [];
        // Sort by start_time
        return [...graph.nodes].sort((a, b) => a.start_time - b.start_time);
    }, [graph]);

    const selectedNode = useMemo(() => {
        if (!graph || !selectedNodeId) return null;
        return graph.nodes.find((node) => node.id === selectedNodeId) || null;
    }, [graph, selectedNodeId]);

    const toggleExpand = (id: string) => {
        setExpandedNodes(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center bg-app animate-pulse">
                <div className="icon-chip icon-chip--sky icon-chip-lg mb-4"><PlayCircleIcon className="w-6 h-6" /></div>
            </div>
        );
    }

    if (error || !run) {
        return (
            <div className="h-full flex flex-col items-center justify-center bg-app text-text-muted">
                <ExclamationTriangleIcon className="w-8 h-8 mb-4 text-rose-500" />
                <p className="mb-4">{error || 'Run not found'}</p>
                <Button onClick={() => onBack()}>Go Back</Button>
            </div>
        )
    }

    return (
        <div className="h-full flex flex-col bg-app animate-soft-in">
            {/* Header */}
            <PageHeader
                title={`Run ${run.id.slice(0, 8)}`}
                subtitle={`Session: ${run.session_id}`}
                badge={<Badge variant={statusVariant(run.status)}>{run.status}</Badge>}
                actions={
                    <div className="flex gap-2">
                        {run.trace_id && onOpenTrace && (
                            <Button variant="secondary" onClick={() => onOpenTrace(run.trace_id)}>
                                Open trace
                            </Button>
                        )}
                        <Button variant="secondary" onClick={() => onBack(run.session_id)}>Back</Button>
                    </div>
                }
            />

            {/* Outcome Strip */}
            <div className="px-6 py-4 bg-panel border-b border-border-hairline flex items-center justify-between shadow-sm z-10">
                <div>
                    <div className="text-[10px] uppercase tracking-widest text-text-muted font-bold mb-1">Outcome</div>
                    <div className="text-sm font-medium text-text-main flex items-center gap-2">
                        {run.status === 'success' || run.status === 'completed' ? (
                            <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Completed successfully
                            </span>
                        ) : (
                            <span className="text-rose-600 dark:text-rose-400 flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-rose-500"></span> Failed with error
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex gap-10">
                    <div>
                        <div className="text-[10px] uppercase tracking-widest text-text-muted font-bold mb-1">Tokens</div>
                        <div className="text-sm font-mono text-text-main">{run.total_tokens?.toLocaleString() ?? 0}</div>
                    </div>
                    <div>
                        <div className="text-[10px] uppercase tracking-widest text-text-muted font-bold mb-1">Cost</div>
                        <div className="text-sm font-mono text-text-main">${run.total_cost?.toFixed(5) ?? '0.00000'}</div>
                    </div>
                    <div>
                        <div className="text-[10px] uppercase tracking-widest text-text-muted font-bold mb-1">Latency</div>
                        <div className="text-sm font-mono text-text-main">{run.total_latency ? Math.round(run.total_latency) : 0}ms</div>
                    </div>
                </div>
            </div>

            {/* Main Split */}
            <div className="flex-1 flex overflow-hidden">
                {/* Left: Narrative Timeline (60%) */}
                <div className="w-[60%] flex flex-col border-r border-border-hairline bg-app">
                    <div className="px-4 py-3 border-b border-border-hairline flex justify-between items-center bg-panel/50 backdrop-blur-sm sticky top-0 z-10">
                        <div className="flex items-center gap-2">
                            <ListBulletIcon className="w-4 h-4 text-text-muted" />
                            <h3 className="text-sm font-semibold text-text-main">Narrative</h3>
                        </div>
                        <div className="flex bg-border-hairline/50 p-0.5 rounded-lg border border-border-hairline">
                            <button
                                onClick={() => setViewMode('timeline')}
                                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${viewMode === 'timeline' ? 'bg-panel shadow-sm text-text-main' : 'text-text-muted hover:text-text-main hover:bg-black/5 dark:hover:bg-white/5'}`}
                            >
                                Timeline
                            </button>
                            <button
                                onClick={() => setViewMode('graph')}
                                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${viewMode === 'graph' ? 'bg-panel shadow-sm text-text-main' : 'text-text-muted hover:text-text-main hover:bg-black/5 dark:hover:bg-white/5'}`}
                            >
                                Graph
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 scroll-smooth">
                        {viewMode === 'graph' ? (
                            <div className="h-full bg-panel rounded-xl border border-border-base overflow-hidden shadow-inner">
                                {graph ? (
                                    <RunGraphComponent
                                        graph={graph}
                                        selectedNodeId={selectedNodeId}
                                        onSelectNode={setSelectedNodeId}
                                        flaggedNodeIds={flaggedNodeIds}
                                    />
                                ) : graphError ? (
                                    <div className="h-full flex flex-col items-center justify-center gap-3 p-4 text-center">
                                        <p role="alert" className="text-sm text-rose-500">{graphError}</p>
                                        <Button variant="secondary" size="sm" onClick={retryLoad}>
                                            Retry
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="h-full flex items-center justify-center text-text-muted">No Graph Data</div>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-3 pb-10">
                                {sortedNodes.map((node, idx) => (
                                    <div key={node.id} className="relative pl-4">
                                        {/* Connector Line */}
                                        {idx < sortedNodes.length - 1 && (
                                            <div className="absolute left-[29px] top-10 bottom-[-12px] w-px bg-border-hairline z-0"></div>
                                        )}
                                        <TimelineCard
                                            node={node}
                                            selected={selectedNodeId === node.id}
                                            expanded={expandedNodes.has(node.id)}
                                            onSelect={setSelectedNodeId}
                                            onToggleExpand={toggleExpand}
                                        />
                                    </div>
                                ))}
                                {sortedNodes.length === 0 && (
                                    <div className="text-center text-text-muted py-12">
                                        <p>No steps recorded.</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right: Inspector (40%) */}
                <div className="w-[40%] flex flex-col bg-panel h-full overflow-hidden">
                    <div className="px-5 py-4 border-b border-border-hairline bg-panel sticky top-0 z-10">
                        <div className="flex items-center gap-2">
                            <DocumentTextIcon className="w-4 h-4 text-text-muted" />
                            <h3 className="text-sm font-semibold text-text-main">Inspector</h3>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-0">
                        {selectedNode ? (
                            <RunNodeInspector node={selectedNode} />
                        ) : (
                            <div className="p-5 space-y-6">
                                <RunEvaluationPanels
                                    sessionEval={sessionEval}
                                    loading={evalLoading}
                                    running={evalRunning}
                                    error={evalError}
                                    expected={evalExpected}
                                    criteria={evalCriteria}
                                    useJudge={evalUseJudge}
                                    scoreEntries={evalScoreEntries}
                                    failingNodeCount={flaggedNodeIds.length}
                                    onExpectedChange={setEvalExpected}
                                    onCriteriaChange={setEvalCriteria}
                                    onUseJudgeChange={setEvalUseJudge}
                                    onRun={runEvaluation}
                                />
                                <div className="flex flex-col items-center justify-center text-text-muted bg-panel/50 rounded-xl py-10">
                                    <div className="w-12 h-12 rounded-xl bg-app border border-border-hairline flex items-center justify-center mb-3 shadow-sm">
                                        <CpuChipIcon className="w-6 h-6 text-text-muted" />
                                    </div>
                                    <p className="text-sm font-medium">Select a step to view details</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RunNarrative;
