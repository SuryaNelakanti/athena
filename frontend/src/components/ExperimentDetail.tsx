import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Experiment, ExperimentResult } from '../types';
import {
    ChevronLeftIcon,
    BeakerIcon,
    CheckCircleIcon,
    ExclamationCircleIcon,
    ClockIcon,
    PlayIcon
} from '@heroicons/react/24/outline';

interface ExperimentDetailProps {
    experiment: Experiment;
    onBack: () => void;
}

const ExperimentDetail: React.FC<ExperimentDetailProps> = ({ experiment, onBack }) => {
    const [results, setResults] = useState<ExperimentResult[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.getExperimentResults(experiment.id).then(setResults).finally(() => setLoading(false));
    }, [experiment.id]);

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'completed': return <CheckCircleIcon className="w-5 h-5 text-emerald-500" />;
            case 'error': return <ExclamationCircleIcon className="w-5 h-5 text-rose-500" />;
            case 'running': return <PlayIcon className="w-5 h-5 text-blue-500 animate-pulse" />;
            default: return <ClockIcon className="w-5 h-5 text-text-muted" />;
        }
    };

    return (
        <div className="h-full flex flex-col bg-app transition-colors duration-300">
            {/* Header */}
            <div className="h-20 border-b border-border-base flex items-center justify-between px-8 bg-app shrink-0">
                <div className="flex items-center gap-6">
                    <button onClick={onBack} className="p-2 -ml-2 rounded-xl text-text-muted hover:text-text-main hover:bg-panel-hover transition-all">
                        <ChevronLeftIcon className="w-5 h-5" />
                    </button>
                    <div className="flex flex-col">
                        <h2 className="text-xl font-serif font-black text-text-main leading-tight">{experiment.name}</h2>
                        <div className="flex items-center gap-3 text-xs text-text-muted font-medium mt-0.5">
                            <span className="flex items-center gap-1">
                                {getStatusIcon(experiment.status)}
                                <span className="uppercase tracking-widest text-[9px] font-bold">{experiment.status}</span>
                            </span>
                            <span className="w-1 h-1 rounded-full bg-border-hover"></span>
                            <span>{new Date(experiment.created_at).toLocaleDateString()}</span>
                        </div>
                    </div>
                </div>

                <div className="flex gap-8">
                    <div className="flex flex-col items-end">
                        <span className="text-[10px] text-text-muted font-bold uppercase tracking-widest opacity-60">Avg Score</span>
                        <span className="text-xl font-serif font-black text-text-main tracking-tight">
                            {((experiment.summary.avg_score || 0) * 100).toFixed(1)}%
                        </span>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8">
                <div className="grid grid-cols-4 gap-6 mb-8">
                    <div className="bg-panel border border-border-base p-6 rounded-2xl shadow-sm">
                        <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-muted opacity-60 mb-2">Total Rows</h3>
                        <div className="text-2xl font-bold text-text-main">{results.length}</div>
                    </div>
                    <div className="bg-panel border border-border-base p-6 rounded-2xl shadow-sm">
                        <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-muted opacity-60 mb-2">Dataset</h3>
                        <div className="text-sm font-bold text-text-main truncate" title={experiment.dataset_id}>{experiment.dataset_id}</div>
                    </div>
                </div>

                <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-text-main tracking-tight uppercase tracking-widest text-[10px] opacity-60">Detailed Results</h3>
                </div>

                {loading ? (
                    <div className="py-20 text-center text-text-muted italic">Loading results...</div>
                ) : (
                    <div className="border border-border-base rounded-2xl overflow-hidden bg-panel shadow-sm">
                        <div className="grid grid-cols-12 gap-4 px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-text-muted border-b border-border-base bg-app/50">
                            <div className="col-span-4">Output</div>
                            <div className="col-span-4">Scores</div>
                            <div className="col-span-2 text-right">Latency</div>
                        </div>
                        <div className="divide-y divide-border-base/50">
                            {results.map((res) => (
                                <div key={res.id} className="grid grid-cols-12 gap-4 px-6 py-4 text-xs text-text-main hover:bg-panel-hover transition-colors">
                                    <div className="col-span-4">
                                        <div className="bg-app/50 p-2 rounded-lg border border-border-base/50 max-h-24 overflow-y-auto font-mono text-[10px]">
                                            {JSON.stringify(res.output, null, 2)}
                                        </div>
                                    </div>
                                    <div className="col-span-4">
                                        <div className="flex flex-wrap gap-2">
                                            {Object.entries(res.scores).map(([name, score]) => (
                                                <div key={name} className="flex items-center gap-2 px-2 py-1 bg-app border border-border-base rounded-lg shadow-sm">
                                                    <span className="text-[9px] font-bold uppercase tracking-wider text-text-muted">{name}</span>
                                                    <span className={`text-xs font-bold ${Number(score) > 0.7 ? 'text-emerald-500' : 'text-amber-500'}`}>{Number(score).toFixed(2)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="col-span-2 text-right font-mono text-text-muted">
                                        {res.latency_ms.toFixed(0)}ms
                                    </div>
                                </div>
                            ))}
                            {results.length === 0 && (
                                <div className="py-20 text-center text-text-muted italic text-sm">No results for this experiment yet.</div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ExperimentDetail;
