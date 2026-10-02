import type React from 'react';
import type { Span } from '../../types';
import { ChatBubbleLeftRightIcon, CodeBracketIcon, CubeIcon } from '@heroicons/react/24/outline';
import { Tooltip } from '../../components/ui/Tooltip';

interface SpanRowProps {
    span: Span;
    depth: number;
    isSelected: boolean;
    onSelect: (s: Span) => void;
    minStart: number;
    totalDuration: number;
}

export const SpanRow: React.FC<SpanRowProps> = ({
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

export const JSONViewer = ({ data, label }: { data: unknown, label: string }) => (
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
