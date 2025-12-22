import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Experiment } from '../types';
import { BeakerIcon, PlusIcon, ChevronRightIcon, PlayIcon, CheckCircleIcon, ExclamationCircleIcon, ClockIcon } from '@heroicons/react/24/outline';

interface ExperimentListProps {
    projectId: string;
    onSelectExperiment: (experiment: Experiment) => void;
}

const ExperimentList: React.FC<ExperimentListProps> = ({ projectId, onSelectExperiment }) => {
    const [experiments, setExperiments] = useState<Experiment[]>([]);
    const [datasets, setDatasets] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newExperiment, setNewExperiment] = useState({ name: '', dataset_id: '' });
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadExperiments();
        api.getDatasets(projectId).then(setDatasets).catch(console.error);
    }, [projectId]);

    const loadExperiments = async () => {
        setLoading(true);
        try {
            const data = await api.getExperiments(projectId);
            setExperiments(data);
        } catch (e) {
            console.error("Failed to load experiments", e);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateExperiment = async () => {
        if (!newExperiment.name.trim() || !newExperiment.dataset_id) return;
        setError(null);
        try {
            await api.createExperiment({
                name: newExperiment.name,
                dataset_id: newExperiment.dataset_id,
                project_id: projectId,
                summary: { avg_score: 0 }
            });
            setNewExperiment({ name: '', dataset_id: '' });
            setShowCreateModal(false);
            loadExperiments();
        } catch (e: any) {
            setError(e.message || "Failed to create experiment");
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'completed': return <CheckCircleIcon className="w-4 h-4 text-emerald-500" />;
            case 'error': return <ExclamationCircleIcon className="w-4 h-4 text-rose-500" />;
            case 'running': return <PlayIcon className="w-4 h-4 text-blue-500 animate-pulse" />;
            default: return <ClockIcon className="w-4 h-4 text-text-muted" />;
        }
    };

    return (
        <div className="p-8 h-full overflow-y-auto bg-app transition-colors duration-300 relative">
            <div className="flex justify-between items-end mb-8">
                <div>
                    <h1 className="text-3xl font-serif font-black text-text-main tracking-tight">Experiments</h1>
                    <p className="text-text-muted text-sm mt-1">Run complex evaluations across datasets to measure model quality.</p>
                </div>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-wispr-purple text-white rounded-xl text-sm font-bold shadow-lg shadow-wispr-purple/20 hover:bg-wispr-purple-dark transition-all"
                >
                    <PlusIcon className="w-4 h-4" />
                    NEW EXPERIMENT
                </button>
            </div>

            {/* Create Modal */}
            {showCreateModal && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-panel border border-border-base rounded-3xl p-8 max-w-md w-full shadow-2xl">
                        <h2 className="text-2xl font-serif font-black text-text-main mb-6">New Experiment</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-[10px] font-bold uppercase tracking-widest text-text-muted mb-2">Name</label>
                                <input
                                    autoFocus
                                    type="text"
                                    className="w-full bg-app border border-border-base rounded-xl px-4 py-3 text-sm text-text-main focus:ring-2 focus:ring-wispr-purple/20 focus:outline-none transition-all"
                                    placeholder="e.g. GPT-4o Evaluation"
                                    value={newExperiment.name}
                                    onChange={e => setNewExperiment({ ...newExperiment, name: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold uppercase tracking-widest text-text-muted mb-2">Select Dataset</label>
                                <select
                                    className="w-full bg-app border border-border-base rounded-xl px-4 py-3 text-sm text-text-main focus:ring-2 focus:ring-wispr-purple/20 focus:outline-none transition-all appearance-none"
                                    value={newExperiment.dataset_id}
                                    onChange={e => setNewExperiment({ ...newExperiment, dataset_id: e.target.value })}
                                >
                                    <option value="">Select a dataset...</option>
                                    {datasets.map(ds => (
                                        <option key={ds.id} value={ds.id}>{ds.name} (v{ds.version})</option>
                                    ))}
                                </select>
                            </div>
                            {error && <p className="text-xs text-rose-500 font-medium">{error}</p>}
                            <div className="flex gap-4 pt-4">
                                <button
                                    onClick={() => setShowCreateModal(false)}
                                    className="flex-1 px-4 py-3 bg-app border border-border-base rounded-xl text-sm font-bold text-text-muted hover:text-text-main transition-all"
                                >
                                    CANCEL
                                </button>
                                <button
                                    onClick={handleCreateExperiment}
                                    className="flex-1 px-4 py-3 bg-wispr-purple text-white rounded-xl text-sm font-bold shadow-lg shadow-wispr-purple/20 hover:bg-wispr-purple-dark transition-all"
                                >
                                    CREATE
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {loading ? (
                <div className="flex items-center justify-center py-20 text-text-muted">Loading experiments...</div>
            ) : (
                <div className="grid grid-cols-1 gap-4">
                    {experiments.map(exp => (
                        <div
                            key={exp.id}
                            onClick={() => onSelectExperiment(exp)}
                            className="bg-panel border border-border-base p-6 rounded-2xl hover:border-border-hover transition-all group cursor-pointer flex items-center justify-between"
                        >
                            <div className="flex items-center gap-6">
                                <div className="p-3 bg-wispr-purple/10 rounded-xl">
                                    <BeakerIcon className="w-6 h-6 text-wispr-purple" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <h3 className="text-lg font-bold text-text-main">{exp.name}</h3>
                                        <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${exp.status === 'completed' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' :
                                                exp.status === 'error' ? 'bg-rose-500/10 text-rose-600 border-rose-500/20' :
                                                    'bg-panel text-text-muted border-border-base'
                                            }`}>
                                            {getStatusIcon(exp.status)}
                                            {exp.status}
                                        </span>
                                    </div>
                                <div className="flex items-center gap-4 text-xs text-text-muted font-medium">
                                        <span>Dataset: <span className="text-text-main">{exp.dataset_id}</span></span>
                                        <span className="w-1 h-1 rounded-full bg-border-base"></span>
                                        <span>Started {new Date(exp.created_at).toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-8">
                                <div className="flex flex-col items-end">
                                    <span className="text-[10px] text-text-muted font-bold uppercase tracking-widest opacity-60">Main Version</span>
                                    <span className="text-xs font-bold text-text-main">{(exp.summary as any)?.main_version_id ? 'SET' : '-'}</span>
                                </div>
                                <ChevronRightIcon className="w-5 h-5 text-border-base group-hover:text-text-muted transition-colors ml-4" />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {experiments.length === 0 && !loading && (
                <div className="flex flex-col items-center justify-center py-20 bg-panel/30 border-2 border-dashed border-border-base rounded-3xl">
                    <BeakerIcon className="w-12 h-12 text-border-base mb-4" />
                    <h3 className="text-text-main font-bold">No experiments found</h3>
                    <p className="text-text-muted text-sm mt-1">Evaluate your prompts against datasets to ensure reliability.</p>
                </div>
            )}
        </div>
    );
};

export default ExperimentList;
