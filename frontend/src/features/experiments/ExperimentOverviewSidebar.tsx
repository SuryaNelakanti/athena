import {
    CheckCircleIcon,
    ClockIcon,
    PlayIcon,
    StopIcon,
    XCircleIcon,
} from '@heroicons/react/24/outline';
import { Badge, Button, Card } from '../../components/ui';
import { formatDateTime, formatNumber } from './formatting';
import type { ExperimentRun, ExperimentVersion, Function, ScorerConfig } from '../../types';

interface ExperimentOverviewSidebarProps {
    versions: ExperimentVersion[];
    selectedVersion: ExperimentVersion | null;
    mainVersionId?: string | null;
    configuredScorers: ScorerConfig[];
    scorerIndex: ReadonlyMap<string, Function>;
    runs: ExperimentRun[];
    selectedRun: ExperimentRun | null;
    onSelectVersion: (versionId: string) => void;
    onSelectRun: (runId: string) => void;
    onCancelRun: (runId: string) => void;
}

export function ExperimentOverviewSidebar({
    versions,
    selectedVersion,
    mainVersionId,
    configuredScorers,
    scorerIndex,
    runs,
    selectedRun,
    onSelectVersion,
    onSelectRun,
    onCancelRun,
}: ExperimentOverviewSidebarProps) {
    const modelConfig = selectedVersion?.config.model;
    const taskConfig = selectedVersion?.config.task;

    return (
        <div className="flex flex-col gap-4 overflow-y-auto pr-1">
            <Card className="p-4">
                <div className="flex items-center justify-between mb-3">
                    <div className="text-xs uppercase tracking-widest text-text-muted font-semibold">Versions</div>
                    <Badge variant="neutral">{versions.length} total</Badge>
                </div>
                <div className="space-y-2">
                    {versions.map((version) => {
                        const isActive = version.id === selectedVersion?.id;
                        const modelLabel = version.config.model?.id || 'model';
                        return (
                            <button
                                key={version.id}
                                onClick={() => onSelectVersion(version.id)}
                                className={`w-full text-left rounded-lg border px-3 py-2 transition ${isActive ? 'border-primary/40 bg-primary/10' : 'border-border-base hover:bg-panel-hover'}`}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-semibold text-text-main">v{version.version_number}</span>
                                        {mainVersionId === version.id && <Badge variant="primary">Main</Badge>}
                                    </div>
                                    <span className="text-[10px] text-text-muted">{formatDateTime(version.created_at)}</span>
                                </div>
                                <div className="mt-1 text-xs text-text-muted truncate">{modelLabel}</div>
                                <div className="mt-1 text-[10px] text-text-muted">Dataset v{version.dataset_version_pinned}</div>
                            </button>
                        );
                    })}
                </div>
            </Card>

            <Card className="p-4">
                <div className="text-xs uppercase tracking-widest text-text-muted font-semibold mb-3">Version Config</div>
                {selectedVersion ? (
                    <div className="space-y-3 text-xs text-text-muted">
                        <div>
                            <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold mb-1">Model</div>
                            <div className="text-text-main font-medium">{modelConfig?.id || 'Unknown model'}</div>
                            <div className="text-[11px]">Provider: {modelConfig?.provider || 'n/a'}</div>
                            <div className="text-[11px]">Temperature: {formatNumber(modelConfig?.temperature ?? 1.0, 2)}</div>
                        </div>
                        <div>
                            <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold mb-1">Prompt</div>
                            <div className="text-[11px] text-text-muted whitespace-pre-wrap">{taskConfig?.system_prompt || 'No system prompt'}</div>
                            {taskConfig?.prompt_template && (
                                <div className="text-[11px] text-text-muted whitespace-pre-wrap mt-2">
                                    Template: {taskConfig.prompt_template}
                                </div>
                            )}
                        </div>
                        <div>
                            <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold mb-1">Scorers</div>
                            <div className="space-y-1">
                                {configuredScorers.map((scorer) => {
                                    const metadata = scorerIndex.get(scorer.type);
                                    return (
                                        <div key={scorer.type} className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className="text-text-main">{metadata?.display_name || scorer.type}</span>
                                                {scorer.is_primary && <Badge variant="primary">Primary</Badge>}
                                            </div>
                                            <span className="text-[10px]">Threshold {formatNumber(scorer.threshold ?? 0.8, 2)}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="text-xs text-text-muted">Select a version to see config.</div>
                )}
            </Card>

            <Card className="p-4">
                <div className="flex items-center justify-between mb-3">
                    <div className="text-xs uppercase tracking-widest text-text-muted font-semibold">Runs</div>
                    <Badge variant="neutral">{runs.length}</Badge>
                </div>
                <div className="space-y-2">
                    {runs.length === 0 && <div className="text-xs text-text-muted">No runs yet.</div>}
                    {runs.map((run) => {
                        const isActive = run.id === selectedRun?.id;
                        const averageScore = typeof run.summary?.avg_score === 'number' ? run.summary.avg_score : null;
                        const weightedAverageScore = typeof run.summary?.weighted_avg_score === 'number'
                            ? run.summary.weighted_avg_score
                            : null;
                        const statusIcon = run.status === 'completed'
                            ? <CheckCircleIcon className="w-3 h-3" />
                            : run.status === 'error'
                                ? <XCircleIcon className="w-3 h-3" />
                                : run.status === 'running'
                                    ? <PlayIcon className="w-3 h-3 animate-pulse" />
                                    : <ClockIcon className="w-3 h-3" />;
                        const statusVariant = run.status === 'completed'
                            ? 'success'
                            : run.status === 'error'
                                ? 'danger'
                                : run.status === 'running'
                                    ? 'primary'
                                    : 'neutral';

                        return (
                            <button
                                key={run.id}
                                onClick={() => onSelectRun(run.id)}
                                className={`w-full text-left rounded-lg border px-3 py-2 transition ${isActive ? 'border-primary/40 bg-primary/10' : 'border-border-base hover:bg-panel-hover'}`}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Badge variant={statusVariant} className="gap-1">
                                            {statusIcon}
                                            {run.status}
                                        </Badge>
                                        <span className="text-xs text-text-muted">{formatDateTime(run.created_at)}</span>
                                    </div>
                                    {run.status === 'running' && (
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                onCancelRun(run.id);
                                            }}
                                        >
                                            <StopIcon className="w-3 h-3" /> Cancel
                                        </Button>
                                    )}
                                </div>
                                <div className="mt-1 text-[11px] text-text-muted">
                                    Avg {formatNumber(averageScore, 2)} - Weighted {formatNumber(weightedAverageScore, 2)}
                                </div>
                            </button>
                        );
                    })}
                </div>
            </Card>
        </div>
    );
}
