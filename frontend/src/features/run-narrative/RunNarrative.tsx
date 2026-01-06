import React, { useEffect, useState, useMemo } from 'react';
import { AgentRun, RunGraph, RunGraphNode } from '../../types';
import { api } from '../../lib/api';
import { Badge, Button } from '../../components/ui';
import { PageHeader } from '../../layouts/PageHeader';
import RunGraphComponent from './RunGraph';
import TimelineCard from './TimelineCard';
import {
    ClockIcon,
    ExclamationTriangleIcon,
    PlayCircleIcon,
    DocumentTextIcon,
    ListBulletIcon,
    CpuChipIcon,
    CurrencyDollarIcon
} from '@heroicons/react/24/outline';

interface RunNarrativeProps {
    runId: string;
    onBack: (sessionId?: string) => void;
    onOpenTrace?: (traceId: string) => void;
}

const statusVariant = (status: string): 'neutral' | 'primary' | 'success' | 'warning' | 'danger' => {
    switch (status) {
        case 'error': return 'danger';
        case 'active': return 'primary';
        case 'running': return 'primary';
        case 'completed': return 'success';
        case 'success': return 'success';
        default: return 'neutral';
    }
};

const RunNarrative: React.FC<RunNarrativeProps> = ({ runId, onBack, onOpenTrace }) => {
    const [run, setRun] = useState<AgentRun | null>(null);
    const [graph, setGraph] = useState<RunGraph | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'timeline' | 'graph'>('timeline');
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (!runId) return;
        setLoading(true);
        setError(null);

        Promise.all([
            api.getRun(runId),
            api.getRunGraph(runId).catch(() => null)
        ])
            .then(([runData, graphData]) => {
                setRun(runData);
                setGraph(graphData);
                if (graphData && graphData.root_id) {
                    // Select root by default logic if needed, or nothing
                    // setSelectedNodeId(graphData.root_id);
                }
            })
            .catch((err) => {
                setError(err.message || 'Failed to load run');
            })
            .finally(() => setLoading(false));
    }, [runId]);

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
                                    <RunGraphComponent graph={graph} selectedNodeId={selectedNodeId} onSelectNode={setSelectedNodeId} />
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
                            <div className="p-5 space-y-6">
                                {/* Node Header */}
                                <div>
                                    <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold mb-1">
                                        {selectedNode.kind}
                                    </div>
                                    <h2 className="text-lg font-bold text-text-main break-words">{selectedNode.name}</h2>
                                    <div className="flex items-center gap-2 mt-3">
                                        <Badge variant={statusVariant(selectedNode.status)}>{selectedNode.status}</Badge>
                                        <span className="text-xs text-text-muted font-mono">{selectedNode.id.slice(0, 8)}</span>
                                    </div>
                                </div>

                                {/* Error Box */}
                                {selectedNode.error_message && (
                                    <div className="p-4 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg">
                                        <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 mb-2">
                                            <ExclamationTriangleIcon className="w-4 h-4" />
                                            <span className="text-xs font-bold uppercase tracking-wide">Error</span>
                                        </div>
                                        <p className="text-sm text-rose-700 dark:text-rose-300 font-mono text-xs whitespace-pre-wrap">
                                            {selectedNode.error_message}
                                        </p>
                                    </div>
                                )}

                                {/* Metrics Grid */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-3 bg-app rounded-lg border border-border-hairline">
                                        <div className="flex items-center gap-2 text-text-muted mb-1">
                                            <ClockIcon className="w-3.5 h-3.5" />
                                            <span className="text-[10px] uppercase tracking-widest font-semibold">Duration</span>
                                        </div>
                                        <div className="text-sm font-mono font-medium text-text-main">
                                            {Math.round(selectedNode.duration_ms)}ms
                                        </div>
                                    </div>
                                    <div className="p-3 bg-app rounded-lg border border-border-hairline">
                                        <div className="flex items-center gap-2 text-text-muted mb-1">
                                            <CurrencyDollarIcon className="w-3.5 h-3.5" />
                                            <span className="text-[10px] uppercase tracking-widest font-semibold">Cost</span>
                                        </div>
                                        <div className="text-sm font-mono font-medium text-text-main">
                                            ${selectedNode.metrics?.total_cost?.toFixed(6) ?? '0.000'}
                                        </div>
                                    </div>
                                </div>

                                {/* Input & Output */}
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] uppercase tracking-widest text-text-muted font-bold">Input</span>
                                        </div>
                                        <div className="bg-app border border-border-hairline rounded-lg overflow-hidden">
                                            <pre className="text-xs text-text-main p-3 font-mono whitespace-pre-wrap max-h-[300px] overflow-y-auto">
                                                {JSON.stringify(selectedNode.input ?? {}, null, 2)}
                                            </pre>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] uppercase tracking-widest text-text-muted font-bold">Output</span>
                                        </div>
                                        <div className="bg-app border border-border-hairline rounded-lg overflow-hidden">
                                            <pre className="text-xs text-text-main p-3 font-mono whitespace-pre-wrap max-h-[300px] overflow-y-auto">
                                                {JSON.stringify(selectedNode.output ?? {}, null, 2)}
                                            </pre>
                                        </div>
                                    </div>
                                </div>

                                {/* Causal Chain */}
                                {selectedNode.causal_chain && selectedNode.causal_chain.length > 0 && (
                                    <div className="space-y-2 pt-4 border-t border-border-hairline">
                                        <span className="text-[10px] uppercase tracking-widest text-text-muted font-bold">Causal Chain</span>
                                        <div className="space-y-1">
                                            {selectedNode.causal_chain.map((ancestor, idx) => (
                                                <div key={ancestor.id} className="text-xs px-3 py-2 rounded-lg border border-border-hairline bg-app flex items-center justify-between">
                                                    <span className="font-mono text-text-muted">{idx + 1}. {ancestor.name}</span>
                                                    <Badge variant={statusVariant(ancestor.status)} size="sm">{ancestor.status}</Badge>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Metadata Attributes */}
                                {selectedNode.attributes && Object.keys(selectedNode.attributes).length > 0 && (
                                    <div className="space-y-2 pt-4 border-t border-border-hairline">
                                        <span className="text-[10px] uppercase tracking-widest text-text-muted font-bold">Attributes</span>
                                        <div className="bg-app border border-border-hairline rounded-lg overflow-hidden">
                                            <pre className="text-xs text-text-muted p-3 font-mono whitespace-pre-wrap max-h-[200px] overflow-y-auto">
                                                {JSON.stringify(selectedNode.attributes, null, 2)}
                                            </pre>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-text-muted bg-panel/50">
                                <div className="w-12 h-12 rounded-xl bg-app border border-border-hairline flex items-center justify-center mb-3 shadow-sm">
                                    <CpuChipIcon className="w-6 h-6 text-text-muted" />
                                </div>
                                <p className="text-sm font-medium">Select a step to view details</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RunNarrative;
