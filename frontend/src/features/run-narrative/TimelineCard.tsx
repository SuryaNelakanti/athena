import React from 'react';
import { RunGraphNode } from '../../types';
import { Badge } from '../../components/ui';
import {
    ClockIcon,
    CurrencyDollarIcon,
    DocumentTextIcon,
    ExclamationTriangleIcon,
    ChevronRightIcon,
    ChevronDownIcon
} from '@heroicons/react/24/outline';

interface TimelineCardProps {
    node: RunGraphNode;
    selected?: boolean;
    expanded?: boolean;
    onSelect?: (nodeId: string) => void;
    onToggleExpand?: (nodeId: string) => void;
}

const statusColor = (status: string) => {
    switch (status) {
        case 'success': return 'border-emerald-500/50 bg-emerald-500/5';
        case 'error': return 'border-rose-500/50 bg-rose-500/5';
        case 'running': return 'border-blue-500/50 bg-blue-500/5';
        default: return 'border-border-base bg-panel';
    }
};

const TimelineCard: React.FC<TimelineCardProps> = ({ node, selected, expanded, onSelect, onToggleExpand }) => {
    return (
        <div
            className={`
            relative rounded-lg border transition-all group
            ${selected ? 'ring-2 ring-primary border-transparent' : 'hover:border-border-hover'}
            ${statusColor(node.status)}
            ${selected ? 'bg-panel shadow-sm' : ''}
        `}
        >
            <div
                className="p-3 flex flex-col gap-2 cursor-pointer"
                onClick={() => onSelect?.(node.id)}
            >
                <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2 overflow-hidden">
                        <button
                            onClick={(e) => { e.stopPropagation(); onToggleExpand?.(node.id); }}
                            className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded mr-1"
                        >
                            {expanded ? <ChevronDownIcon className="w-3 h-3" /> : <ChevronRightIcon className="w-3 h-3" />}
                        </button>
                        <div className="flex items-center gap-2 min-w-0">
                            <span className="shrink-0 text-[10px] font-mono uppercase tracking-wider text-text-muted bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded">{node.kind}</span>
                            <h4 className="text-sm font-semibold text-text-main truncate" title={node.name}>{node.name}</h4>
                        </div>
                    </div>
                    <Badge variant={node.status === 'error' ? 'danger' : 'neutral'} size="sm">{node.status}</Badge>
                </div>

                {node.error_message && (
                    <div className="text-xs text-rose-600 bg-rose-100 dark:bg-rose-900/30 p-2 rounded border border-rose-200 dark:border-rose-800">
                        <ExclamationTriangleIcon className="w-3 h-3 inline mr-1" />
                        {node.error_message}
                    </div>
                )}

                <div className="pl-8 flex items-center gap-4 text-xs text-text-muted">
                    <div className="flex items-center gap-1">
                        <ClockIcon className="w-3 h-3" />
                        <span>{Math.round(node.duration_ms)}ms</span>
                    </div>
                    {node.metrics?.total_tokens && (
                        <div className="flex items-center gap-1">
                            <DocumentTextIcon className="w-3 h-3" />
                            <span>{node.metrics.total_tokens.toLocaleString()}</span>
                        </div>
                    )}
                    {node.metrics?.total_cost && (
                        <div className="flex items-center gap-1">
                            <CurrencyDollarIcon className="w-3 h-3" />
                            <span>${node.metrics.total_cost.toFixed(5)}</span>
                        </div>
                    )}
                </div>
            </div>

            {expanded && (
                <div className="px-3 pb-3 pt-0 pl-11 space-y-3 animate-soft-in">
                    {/* Input */}
                    {node.input && Object.keys(node.input).length > 0 && (
                        <div>
                            <div className="text-[10px] uppercase tracking-widest text-text-muted font-bold mb-1">Input</div>
                            <pre className="text-xs font-mono bg-app p-2 rounded border border-border-hairline overflow-x-auto text-text-main whitespace-pre-wrap max-h-60 overflow-y-auto">
                                {JSON.stringify(node.input, null, 2)}
                            </pre>
                        </div>
                    )}
                    {/* Output */}
                    {node.output && Object.keys(node.output).length > 0 && (
                        <div>
                            <div className="text-[10px] uppercase tracking-widest text-text-muted font-bold mb-1">Output</div>
                            <pre className="text-xs font-mono bg-app p-2 rounded border border-border-hairline overflow-x-auto text-text-main whitespace-pre-wrap max-h-60 overflow-y-auto">
                                {JSON.stringify(node.output, null, 2)}
                            </pre>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default TimelineCard;
