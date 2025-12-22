import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Experiment } from '../../types';
import { BeakerIcon, PlusIcon, ChevronRightIcon, PlayIcon, CheckCircleIcon, ExclamationCircleIcon, ClockIcon } from '@heroicons/react/24/outline';
import { Badge, Button, Card, Input, Modal, SectionHeader, Select } from '../ui';

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
            case 'running': return <PlayIcon className="w-4 h-4 text-primary animate-pulse" />;
            default: return <ClockIcon className="w-4 h-4 text-text-muted" />;
        }
    };

    const getStatusVariant = (status: string) => {
        switch (status) {
            case 'completed':
                return 'success';
            case 'error':
                return 'danger';
            case 'running':
                return 'primary';
            default:
                return 'neutral';
        }
    };

    return (
        <div className="p-8 h-full overflow-y-auto bg-app transition-colors duration-300 relative">
            <div className="mb-8">
                <SectionHeader
                    title="Experiments"
                    subtitle="Run complex evaluations across datasets to measure model quality."
                    actions={
                        <Button variant="primary" onClick={() => setShowCreateModal(true)}>
                            <PlusIcon className="w-4 h-4" />
                            New Experiment
                        </Button>
                    }
                />
            </div>

            <Modal
                open={showCreateModal}
                title="New Experiment"
                description="Create an experiment run across a dataset."
                onClose={() => setShowCreateModal(false)}
                footer={
                    <div className="flex items-center justify-end gap-2">
                        <Button variant="secondary" onClick={() => setShowCreateModal(false)}>
                            Cancel
                        </Button>
                        <Button variant="primary" onClick={handleCreateExperiment}>
                            Create
                        </Button>
                    </div>
                }
            >
                <div className="space-y-4">
                    <div>
                        <label className="block text-[11px] font-medium text-text-muted mb-2">Name</label>
                        <Input
                            autoFocus
                            type="text"
                            placeholder="e.g. GPT-4o Evaluation"
                            value={newExperiment.name}
                            onChange={e => setNewExperiment({ ...newExperiment, name: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="block text-[11px] font-medium text-text-muted mb-2">Select Dataset</label>
                        <Select
                            value={newExperiment.dataset_id}
                            onChange={e => setNewExperiment({ ...newExperiment, dataset_id: e.target.value })}
                        >
                            <option value="">Select a dataset...</option>
                            {datasets.map(ds => (
                                <option key={ds.id} value={ds.id}>{ds.name} (v{ds.version})</option>
                            ))}
                        </Select>
                    </div>
                    {error && <p className="text-xs text-rose-500 font-medium">{error}</p>}
                </div>
            </Modal>

            {loading ? (
                <div className="flex items-center justify-center py-20 text-text-muted">Loading experiments...</div>
            ) : (
                <div className="grid grid-cols-1 gap-4">
                    {experiments.map(exp => (
                        <Card
                            key={exp.id}
                            onClick={() => onSelectExperiment(exp)}
                            className="p-6 hover:border-border-hover transition-all group cursor-pointer flex items-center justify-between"
                        >
                            <div className="flex items-center gap-6">
                                <div className="p-3 bg-primary/10 rounded-md">
                                    <BeakerIcon className="w-6 h-6 text-primary" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <h3 className="text-lg font-semibold text-text-main">{exp.name}</h3>
                                        <Badge variant={getStatusVariant(exp.status)} className="gap-1">
                                            {getStatusIcon(exp.status)}
                                            {exp.status}
                                        </Badge>
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
                        </Card>
                    ))}
                </div>
            )}

            {experiments.length === 0 && !loading && (
                <div className="flex flex-col items-center justify-center py-20 bg-panel/30 border-2 border-dashed border-border-base rounded-lg">
                    <BeakerIcon className="w-12 h-12 text-border-base mb-4" />
                    <h3 className="text-text-main font-bold">No experiments found</h3>
                    <p className="text-text-muted text-sm mt-1">Evaluate your prompts against datasets to ensure reliability.</p>
                </div>
            )}
        </div>
    );
};

export default ExperimentList;

