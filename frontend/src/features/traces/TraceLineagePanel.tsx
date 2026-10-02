import {
    ArrowDownRightIcon,
    ArrowUpRightIcon,
    ArrowUturnLeftIcon,
    ArrowsRightLeftIcon,
} from '@heroicons/react/24/outline';
import { Badge, Button, Tooltip } from '../../components/ui';
import type { Trace } from '../../types';
import { formatTraceId, formatTraceTime, statusVariant } from './traceFormatting';

interface TraceLineagePanelProps {
    trace: Trace;
    parentTrace: Trace | null;
    parentTraceLoading: boolean;
    parentTraceError: string | null;
    siblingTraces: Trace[];
    childTraces: Trace[];
    siblingLoading: boolean;
    childLoading: boolean;
    siblingError: string | null;
    childError: string | null;
    onOpenTrace?: (traceId: string) => void;
}

export function TraceLineagePanel({
    trace,
    parentTrace,
    parentTraceLoading,
    parentTraceError,
    siblingTraces,
    childTraces,
    siblingLoading,
    childLoading,
    siblingError,
    childError,
    onOpenTrace,
}: TraceLineagePanelProps) {
    const parentTraceId = trace.parent_trace_id || null;
    const showLineage = Boolean(
        parentTraceId || siblingLoading || childLoading || siblingTraces.length || childTraces.length
    );

    if (!showLineage) return null;

    const parentStatusLabel = parentTraceLoading
        ? 'Loading'
        : parentTrace
            ? parentTrace.status
            : parentTraceError
                ? 'Missing'
                : 'Unknown';
    const parentStatusVariant: 'neutral' | 'warning' | 'danger' | 'success' = parentTraceLoading
        ? 'neutral'
        : parentTrace
            ? statusVariant(parentTrace.status)
            : parentTraceError
                ? 'warning'
                : 'neutral';
    const siblingPreview = siblingTraces.slice(0, 3);
    const childPreview = childTraces.slice(0, 3);
    const siblingOverflow = Math.max(siblingTraces.length - siblingPreview.length, 0);
    const childOverflow = Math.max(childTraces.length - childPreview.length, 0);

    return (
        <div className="px-6 py-5 border-b border-border-hairline bg-gradient-to-br from-primary/5 via-transparent to-amber-500/5 relative overflow-hidden">
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute left-10 right-10 top-1/2 h-px bg-gradient-to-r from-primary/0 via-primary/20 to-amber-500/0" />
                <div className="absolute top-6 bottom-6 left-1/2 w-px bg-gradient-to-b from-amber-500/10 via-border-base/40 to-primary/10" />
            </div>
            <div className="relative">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <div className="text-[10px] uppercase tracking-[0.32em] text-text-muted font-bold">
                            Lineage Map
                        </div>
                        <div className="text-xs text-text-muted mt-1 max-w-[520px]">
                            Upstream context, sibling runs, and downstream fixes.
                        </div>
                    </div>
                    {parentTraceId && (
                        <Button
                            onClick={() => onOpenTrace?.(parentTraceId)}
                            variant="secondary"
                            size="sm"
                            className="whitespace-nowrap"
                            disabled={!onOpenTrace}
                        >
                            <ArrowUturnLeftIcon className="w-4 h-4" />
                            Open Parent
                        </Button>
                    )}
                </div>

                <div className="mt-5 grid grid-cols-1 xl:grid-cols-[1fr,1.2fr,1fr] gap-4 items-stretch">
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-text-muted font-bold">
                            <ArrowUpRightIcon className="w-3 h-3 text-amber-500" />
                            Upstream
                        </div>
                        {parentTraceId ? (
                            <div
                                onClick={() => parentTrace && onOpenTrace?.(parentTrace.id)}
                                className={`relative overflow-hidden rounded-xl border border-border-base bg-app/70 p-4 shadow-sm transition-all ${parentTrace && onOpenTrace ? 'cursor-pointer hover:border-amber-500/50 hover:shadow-md' : ''}`}
                            >
                                <div className="absolute inset-0 bg-gradient-to-br from-amber-500/15 via-transparent to-transparent" />
                                <div className="absolute left-0 top-0 h-full w-1 bg-amber-500/40" />
                                <div className="relative">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] uppercase tracking-widest text-text-muted font-bold">Parent Trace</span>
                                        <Badge variant={parentStatusVariant}>{parentStatusLabel}</Badge>
                                    </div>
                                    {parentTraceLoading ? (
                                        <div className="mt-3 space-y-2">
                                            <div className="h-3 w-2/3 rounded-full bg-border-base/60 animate-pulse" />
                                            <div className="h-3 w-1/2 rounded-full bg-border-base/40 animate-pulse" />
                                        </div>
                                    ) : (
                                        <>
                                            <div className="mt-2 text-sm font-semibold text-text-main truncate">
                                                {parentTrace?.root_span?.name || 'Parent trace'}
                                            </div>
                                            <div className="mt-1 text-[11px] text-text-muted flex items-center gap-2">
                                                <Tooltip content={parentTraceId}>
                                                    <span className="font-mono">{formatTraceId(parentTraceId)}</span>
                                                </Tooltip>
                                                <span className="opacity-60">|</span>
                                                <span className="font-sans">{formatTraceTime(parentTrace?.timestamp)}</span>
                                            </div>
                                        </>
                                    )}
                                    {parentTrace && (
                                        <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-text-muted">
                                            <span className="px-2 py-1 rounded-full border border-border-base bg-panel">
                                                Tokens {parentTrace.total_tokens}
                                            </span>
                                            <span className="px-2 py-1 rounded-full border border-border-base bg-panel">
                                                Latency {parentTrace.total_latency}ms
                                            </span>
                                            <span className="px-2 py-1 rounded-full border border-border-base bg-panel">
                                                Cost ${parentTrace.total_cost.toFixed(4)}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="rounded-xl border border-border-base bg-panel/60 p-4">
                                <div className="text-[10px] uppercase tracking-widest text-text-muted font-bold">Origin</div>
                                <div className="text-sm text-text-main mt-2">This trace is the starting point.</div>
                                <div className="text-[11px] text-text-muted mt-1">No parent trace linked.</div>
                            </div>
                        )}

                        <div className="rounded-xl border border-border-base bg-panel/60 p-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-text-muted font-bold">
                                    <ArrowsRightLeftIcon className="w-3 h-3 text-primary" />
                                    Sibling Runs
                                </div>
                                {siblingOverflow > 0 && <Badge variant="primary">+{siblingOverflow}</Badge>}
                            </div>
                            {siblingLoading ? (
                                <div className="mt-3 space-y-2">
                                    <div className="h-3 w-3/4 rounded-full bg-border-base/60 animate-pulse" />
                                    <div className="h-3 w-1/2 rounded-full bg-border-base/40 animate-pulse" />
                                </div>
                            ) : siblingPreview.length === 0 ? (
                                <div className="mt-2 text-xs text-text-muted">
                                    {siblingError || 'No sibling traces yet.'}
                                </div>
                            ) : (
                                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {siblingPreview.map((sibling) => (
                                        <div
                                            key={sibling.id}
                                            onClick={() => onOpenTrace?.(sibling.id)}
                                            className={`group rounded-lg border border-border-base bg-app/70 px-3 py-2 text-xs transition-all ${onOpenTrace ? 'cursor-pointer hover:border-primary/40 hover:shadow-sm' : ''}`}
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className="truncate text-text-main font-semibold">
                                                    {sibling.root_span?.name || 'Sibling trace'}
                                                </span>
                                                <Badge variant={statusVariant(sibling.status)}>{sibling.status}</Badge>
                                            </div>
                                            <div className="mt-1 text-[10px] text-text-muted font-mono">
                                                {formatTraceId(sibling.id)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-primary/5 p-5 shadow-sm">
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/25 via-transparent to-transparent" />
                        <div className="absolute inset-4 rounded-xl border border-primary/15" />
                        <div className="relative">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] uppercase tracking-widest text-text-muted font-bold">Current Trace</span>
                                <Badge variant={statusVariant(trace.status)}>{trace.status}</Badge>
                            </div>
                            <div className="mt-3 text-lg font-semibold text-text-main truncate">
                                {trace.root_span?.name || 'Current trace'}
                            </div>
                            <div className="mt-1 text-[11px] text-text-muted flex items-center gap-2">
                                <Tooltip content={trace.id}>
                                    <span className="font-mono">{formatTraceId(trace.id)}</span>
                                </Tooltip>
                                <span className="opacity-60">|</span>
                                <span className="font-sans">{formatTraceTime(trace.timestamp)}</span>
                            </div>
                            <div className="mt-4 flex flex-wrap gap-2 text-[10px] text-text-muted">
                                <span className="px-2 py-1 rounded-full border border-border-base bg-panel">
                                    Tokens {trace.total_tokens}
                                </span>
                                <span className="px-2 py-1 rounded-full border border-border-base bg-panel">
                                    Latency {trace.total_latency}ms
                                </span>
                                <span className="px-2 py-1 rounded-full border border-border-base bg-panel">
                                    Cost ${trace.total_cost.toFixed(4)}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-text-muted font-bold">
                            <ArrowDownRightIcon className="w-3 h-3 text-emerald-500" />
                            Downstream
                        </div>
                        <div className="rounded-xl border border-border-base bg-panel/60 p-3">
                            <div className="flex items-center justify-between">
                                <div className="text-[10px] uppercase tracking-widest text-text-muted font-bold">Child Runs</div>
                                {childOverflow > 0 && <Badge variant="success">+{childOverflow}</Badge>}
                            </div>
                            {childLoading ? (
                                <div className="mt-3 space-y-2">
                                    <div className="h-3 w-3/4 rounded-full bg-border-base/60 animate-pulse" />
                                    <div className="h-3 w-1/2 rounded-full bg-border-base/40 animate-pulse" />
                                </div>
                            ) : childPreview.length === 0 ? (
                                <div className="mt-2 text-xs text-text-muted">
                                    {childError || 'No child traces yet.'}
                                </div>
                            ) : (
                                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {childPreview.map((child) => (
                                        <div
                                            key={child.id}
                                            onClick={() => onOpenTrace?.(child.id)}
                                            className={`group rounded-lg border border-border-base bg-app/70 px-3 py-2 text-xs transition-all ${onOpenTrace ? 'cursor-pointer hover:border-emerald-500/40 hover:shadow-sm' : ''}`}
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className="truncate text-text-main font-semibold">
                                                    {child.root_span?.name || 'Child trace'}
                                                </span>
                                                <Badge variant={statusVariant(child.status)}>{child.status}</Badge>
                                            </div>
                                            <div className="mt-1 text-[10px] text-text-muted font-mono">
                                                {formatTraceId(child.id)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {parentTraceError && <div className="mt-4 text-xs text-rose-500">{parentTraceError}</div>}
            </div>
        </div>
    );
}
