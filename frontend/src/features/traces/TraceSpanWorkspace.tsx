import { useMemo } from 'react';
import { JSONViewer, SpanRow } from './SpanRow';
import { extractSpanReasoning } from './traceFormatting';
import type { Span, Trace } from '../../types';

interface TraceSpanWorkspaceProps {
    trace: Trace;
    selectedSpan: Span;
    onSelectSpan: (span: Span) => void;
}

export function TraceSpanWorkspace({ trace, selectedSpan, onSelectSpan }: TraceSpanWorkspaceProps) {
    const { orderedSpans, depthBySpanId } = useMemo(() => {
        const childrenByParentId = new Map<string | null, Span[]>();

        for (const span of trace.spans) {
            const parentId = span.parent_id || null;
            const siblings = childrenByParentId.get(parentId);
            if (siblings) {
                siblings.push(span);
            } else {
                childrenByParentId.set(parentId, [span]);
            }
        }

        for (const children of childrenByParentId.values()) {
            children.sort((left, right) => left.start_time - right.start_time);
        }

        const orderedSpans: Span[] = [];
        const depthBySpanId = new Map<string, number>();

        const visitChildren = (parentId: string | null, depth: number) => {
            for (const child of childrenByParentId.get(parentId) || []) {
                orderedSpans.push(child);
                depthBySpanId.set(child.id, depth);
                visitChildren(child.id, depth + 1);
            }
        };

        visitChildren(null, 0);
        return { orderedSpans, depthBySpanId };
    }, [trace.spans]);
    const reasoningContent = extractSpanReasoning(selectedSpan);

    return (
        <div className="flex-1 flex min-h-0">
            <div className="w-1/2 border-r border-border-base overflow-y-auto">
                <div className="py-2">
                    {orderedSpans.map((span) => (
                        <SpanRow
                            key={span.id}
                            span={span}
                            depth={depthBySpanId.get(span.id) || 0}
                            isSelected={selectedSpan.id === span.id}
                            onSelect={onSelectSpan}
                            minStart={trace.root_span.start_time}
                            totalDuration={trace.total_latency}
                        />
                    ))}
                </div>
            </div>

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

                <div className="grid grid-cols-2 gap-4 mb-8">
                    {Object.entries(selectedSpan.attributes).map(([key, value]) => (
                        <div key={key} className="bg-app border border-border-base p-4 rounded-md hover:border-border-hover transition-all group">
                            <div className="text-[9px] text-text-muted uppercase tracking-widest mb-1.5 font-bold opacity-60 group-hover:opacity-100 transition-opacity">{key.replace('_', ' ')}</div>
                            <div className="text-sm text-text-main font-semibold truncate">{String(value)}</div>
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

                {reasoningContent && (
                        <div className="mb-8">
                            <h4 className="text-[10px] uppercase tracking-widest text-amber-600 dark:text-amber-400 font-bold mb-3 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                                Model Reasoning
                                {selectedSpan.attributes?.reasoning_enabled && (
                                    <span className="text-[9px] px-2 py-0.5 bg-amber-500/20 rounded-lg ml-2">
                                        Extended Thinking
                                    </span>
                                )}
                            </h4>
                            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-500/30 rounded-md p-4 overflow-x-auto shadow-sm">
                                <pre className="text-[12px] text-amber-900 dark:text-amber-100 whitespace-pre-wrap leading-relaxed">
                                    {reasoningContent}
                                </pre>
                            </div>
                        </div>
                    )}

                <JSONViewer data={selectedSpan.output} label="Output" />
            </div>
        </div>
    );
}
