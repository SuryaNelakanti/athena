import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Experiment } from '../../types';
import { BeakerIcon, PlusIcon, ChevronRightIcon, PlayIcon, CheckCircleIcon, ExclamationCircleIcon, ClockIcon } from '@heroicons/react/24/outline';
import { Badge, Button, Input, Modal, Select } from '../ui';

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
            case 'completed': return <CheckCircleIcon className="w-3 h-3" />;
            case 'error': return <ExclamationCircleIcon className="w-3 h-3" />;
            case 'running': return <PlayIcon className="w-3 h-3 animate-pulse" />;
            default: return <ClockIcon className="w-3 h-3" />;
        }
    };

    const getStatusVariant = (status: string): 'success' | 'danger' | 'primary' | 'neutral' => {
        switch (status) {
            case 'completed': return 'success';
            case 'error': return 'danger';
            case 'running': return 'primary';
            default: return 'neutral';
        }
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    const getDatasetName = (datasetId: string) => {
        const ds = datasets.find(d => d.id === datasetId);
        return ds?.name || datasetId.substring(0, 8);
    };

    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-border-hairline flex items-center justify-between">
                <div>
                    <h1 className="text-lg font-semibold text-text-main">Experiments</h1>
                    <p className="text-xs text-text-muted mt-0.5">Run evaluations across datasets to measure quality</p>
                </div>
                <Button variant="primary" size="sm" onClick={() => setShowCreateModal(true)}>
                    <PlusIcon className="w-3.5 h-3.5" />
                    New Experiment
                </Button>
            </div>

            {/* Modal */}
            <Modal
                open={showCreateModal}
                title="New Experiment"
                description="Create an experiment run across a dataset."
                onClose={() => setShowCreateModal(false)}
                footer={
                    <div className="flex items-center justify-end gap-2">
                        <Button variant="secondary" size="sm" onClick={() => setShowCreateModal(false)}>
                            Cancel
                        </Button>
                        <Button variant="primary" size="sm" onClick={handleCreateExperiment}>
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
                        <label className="block text-[11px] font-medium text-text-muted mb-2">Dataset</label>
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

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
                {loading ? (
                    <div className="flex items-center justify-center py-20 text-text-muted text-sm">
                        Loading experiments...
                    </div>
                ) : experiments.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20">
                        <div className="w-12 h-12 rounded-full bg-border-base/50 flex items-center justify-center mb-4">
                            <BeakerIcon className="w-6 h-6 text-text-muted" />
                        </div>
                        <h3 className="text-text-main font-medium mb-1">No experiments yet</h3>
                        <p className="text-text-muted text-sm mb-4">Run evaluations to measure model quality</p>
                        <Button variant="primary" size="sm" onClick={() => setShowCreateModal(true)}>
                            <PlusIcon className="w-3.5 h-3.5" />
                            Create Experiment
                        </Button>
                    </div>
                ) : (
                    <div className="divide-y divide-border-hairline">
                        {experiments.map(exp => (
                            <div
                                key={exp.id}
                                onClick={() => onSelectExperiment(exp)}
                                className="px-6 py-4 flex items-center gap-4 hover:bg-panel-hover cursor-pointer transition-colors group"
                            >
                                {/* Icon */}
                                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                                    <BeakerIcon className="w-4 h-4 text-primary" />
                                </div>

                                {/* Main info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-sm font-medium text-text-main truncate">
                                            {exp.name}
                                        </h3>
                                        <Badge variant={getStatusVariant(exp.status)} className="text-[9px] gap-1">
                                            {getStatusIcon(exp.status)}
                                            {exp.status}
                                        </Badge>
                                    </div>
                                    <p className="text-xs text-text-muted truncate mt-0.5">
                                        Dataset: {getDatasetName(exp.dataset_id)}
                                    </p>
                                </div>

                                {/* Stats */}
                                <div className="flex items-center gap-6 text-xs text-text-muted flex-shrink-0">
                                    <div className="w-20 text-right">
                                        {formatDate(exp.created_at)}
                                    </div>
                                </div>

                                {/* Arrow */}
                                <ChevronRightIcon className="w-4 h-4 text-border-base group-hover:text-text-muted transition-colors flex-shrink-0" />
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ExperimentList;
