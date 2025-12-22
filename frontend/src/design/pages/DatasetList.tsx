import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Dataset } from '../../types';
import { CircleStackIcon, PlusIcon, ChevronRightIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import { Button, Input, Modal, SectionHeader, Textarea, Badge, Select } from '../ui';

interface DatasetListProps {
    projectId: string;
    onSelectDataset: (dataset: Dataset) => void;
}

const DatasetList: React.FC<DatasetListProps> = ({ projectId, onSelectDataset }) => {
    const [datasets, setDatasets] = useState<Dataset[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newDataset, setNewDataset] = useState({ name: '', description: '', kind: 'eval' });
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadDatasets();
    }, [projectId]);

    const loadDatasets = async () => {
        setLoading(true);
        try {
            const data = await api.getDatasets(projectId);
            setDatasets(data);
        } catch (e) {
            console.error("Failed to load datasets", e);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateDataset = async () => {
        if (!newDataset.name.trim()) return;
        setError(null);
        try {
            await api.createDataset({
                name: newDataset.name,
                description: newDataset.description,
                kind: newDataset.kind,
                project_id: projectId
            });
            setNewDataset({ name: '', description: '', kind: 'eval' });
            setShowCreateModal(false);
            loadDatasets();
        } catch (e: any) {
            setError(e.message || "Failed to create dataset");
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

    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-border-hairline flex items-center justify-between">
                <div>
                    <h1 className="text-lg font-semibold text-text-main">Datasets</h1>
                    <p className="text-xs text-text-muted mt-0.5">Curated collections for evaluation and fine-tuning</p>
                </div>
                <Button variant="primary" size="sm" onClick={() => setShowCreateModal(true)}>
                    <PlusIcon className="w-3.5 h-3.5" />
                    New Dataset
                </Button>
            </div>

            {/* Modal */}
            <Modal
                open={showCreateModal}
                title="New Dataset"
                description="Create a dataset to store review examples."
                onClose={() => setShowCreateModal(false)}
                footer={
                    <div className="flex items-center justify-end gap-2">
                        <Button variant="secondary" onClick={() => setShowCreateModal(false)}>
                            Cancel
                        </Button>
                        <Button variant="primary" onClick={handleCreateDataset}>
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
                            placeholder="e.g. Production Gold Set"
                            value={newDataset.name}
                            onChange={e => setNewDataset({ ...newDataset, name: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="block text-[11px] font-medium text-text-muted mb-2">Description</label>
                        <Textarea
                            className="h-24 resize-none"
                            placeholder="What is this dataset for?"
                            value={newDataset.description}
                            onChange={e => setNewDataset({ ...newDataset, description: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="block text-[11px] font-medium text-text-muted mb-2">Dataset Type</label>
                        <Select
                            value={newDataset.kind}
                            onChange={(e) => setNewDataset({ ...newDataset, kind: e.target.value })}
                        >
                            <option value="eval">Eval</option>
                            <option value="knowledge">Knowledge</option>
                            <option value="mixed">Mixed</option>
                        </Select>
                    </div>
                    {error && <p className="text-xs text-rose-500 font-medium">{error}</p>}
                </div>
            </Modal>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
                {loading ? (
                    <div className="flex items-center justify-center py-20 text-text-muted text-sm">
                        Loading datasets...
                    </div>
                ) : datasets.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20">
                        <div className="w-12 h-12 rounded-full bg-border-base/50 flex items-center justify-center mb-4">
                            <CircleStackIcon className="w-6 h-6 text-text-muted" />
                        </div>
                        <h3 className="text-text-main font-medium mb-1">No datasets yet</h3>
                        <p className="text-text-muted text-sm mb-4">Create your first dataset to start collecting examples</p>
                        <Button variant="primary" size="sm" onClick={() => setShowCreateModal(true)}>
                            <PlusIcon className="w-3.5 h-3.5" />
                            Create Dataset
                        </Button>
                    </div>
                ) : (
                    <div className="divide-y divide-border-hairline">
                        {datasets.map(ds => (
                            <div
                                key={ds.id}
                                onClick={() => onSelectDataset(ds)}
                                className="px-6 py-4 flex items-center gap-4 hover:bg-panel-hover cursor-pointer transition-colors group"
                            >
                                {/* Icon */}
                                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                                    <CircleStackIcon className="w-4 h-4 text-primary" />
                                </div>

                                {/* Main info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-sm font-medium text-text-main truncate">
                                            {ds.name}
                                        </h3>
                                        <Badge variant="neutral" className="text-[9px]">
                                            v{ds.version}
                                        </Badge>
                                        {ds.kind && (
                                            <Badge variant="outline" className="text-[9px] uppercase">
                                                {ds.kind}
                                            </Badge>
                                        )}
                                    </div>
                                    <p className="text-xs text-text-muted truncate mt-0.5">
                                        {ds.description || 'No description'}
                                    </p>
                                </div>

                                {/* Stats */}
                                <div className="flex items-center gap-6 text-xs text-text-muted flex-shrink-0">
                                    <div className="flex items-center gap-1.5">
                                        <DocumentTextIcon className="w-3.5 h-3.5" />
                                        <span className="tabular-nums">
                                            {ds.row_counts?.total ?? '—'}
                                        </span>
                                        <span>rows</span>
                                    </div>
                                    <div className="w-20 text-right">
                                        {formatDate(ds.created_at)}
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

export default DatasetList;
