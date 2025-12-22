import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Dataset } from '../../types';
import { CircleStackIcon, PlusIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { Button, Card, Input, Modal, SectionHeader, Textarea } from '../ui';

interface DatasetListProps {
    projectId: string;
    onSelectDataset: (dataset: Dataset) => void;
}

const DatasetList: React.FC<DatasetListProps> = ({ projectId, onSelectDataset }) => {
    const [datasets, setDatasets] = useState<Dataset[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newDataset, setNewDataset] = useState({ name: '', description: '' });
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
                project_id: projectId
            });
            setNewDataset({ name: '', description: '' });
            setShowCreateModal(false);
            loadDatasets();
        } catch (e: any) {
            setError(e.message || "Failed to create dataset");
        }
    };

    return (
        <div className="p-8 h-full overflow-y-auto bg-app transition-colors duration-300 relative">
            <div className="mb-8">
                <SectionHeader
                    title="Datasets"
                    subtitle="Curated collections of records for evaluation and training."
                    actions={
                        <Button variant="primary" onClick={() => setShowCreateModal(true)}>
                            <PlusIcon className="w-4 h-4" />
                            New Dataset
                        </Button>
                    }
                />
            </div>

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
                    {error && <p className="text-xs text-rose-500 font-medium">{error}</p>}
                </div>
            </Modal>

            {loading ? (
                <div className="flex items-center justify-center py-20 text-text-muted">Loading datasets...</div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {datasets.map(ds => (
                        <Card
                            key={ds.id}
                            onClick={() => onSelectDataset(ds)}
                            className="p-6 hover:border-border-hover transition-all group cursor-pointer"
                        >
                            <div className="flex justify-between items-start mb-4">
                                <div className="p-3 bg-primary/10 rounded-md">
                                    <CircleStackIcon className="w-6 h-6 text-primary" />
                                </div>
                                <ChevronRightIcon className="w-5 h-5 text-border-base group-hover:text-text-muted transition-colors" />
                            </div>
                            <h3 className="text-lg font-semibold text-text-main mb-1">{ds.name}</h3>
                            <p className="text-text-muted text-xs line-clamp-2 mb-4">{ds.description || 'No description provided.'}</p>
                            <div className="flex items-center gap-4 pt-4 border-t border-border-base/50">
                                <div className="flex flex-col">
                                    <span className="text-[10px] text-text-muted font-medium uppercase tracking-widest opacity-60">Version</span>
                                    <span className="text-sm text-text-main tabular-nums">v{ds.version}</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] text-text-muted font-medium uppercase tracking-widest opacity-60">Created</span>
                                    <span className="text-sm text-text-main">{new Date(ds.created_at).toLocaleDateString()}</span>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            {datasets.length === 0 && !loading && (
                <div className="flex flex-col items-center justify-center py-20 bg-panel/30 border-2 border-dashed border-border-base rounded-lg">
                    <CircleStackIcon className="w-12 h-12 text-border-base mb-4" />
                    <h3 className="text-text-main font-bold">No datasets found</h3>
                    <p className="text-text-muted text-sm mt-1">Create your first dataset to start evaluating your models.</p>
                </div>
            )}
        </div>
    );
};

export default DatasetList;

