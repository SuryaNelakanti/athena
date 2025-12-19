import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Dataset } from '../types';
import { CircleStackIcon, PlusIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

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
            <div className="flex justify-between items-end mb-8">
                <div>
                    <h1 className="text-3xl font-serif font-black text-text-main tracking-tight">Datasets</h1>
                    <p className="text-text-muted text-sm mt-1">Curated collections of records for evaluation and training.</p>
                </div>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-wispr-purple text-white rounded-xl text-sm font-bold shadow-lg shadow-wispr-purple/20 hover:bg-wispr-purple-dark transition-all"
                >
                    <PlusIcon className="w-4 h-4" />
                    NEW DATASET
                </button>
            </div>

            {/* Create Modal */}
            {showCreateModal && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-panel border border-border-base rounded-3xl p-8 max-w-md w-full shadow-2xl">
                        <h2 className="text-2xl font-serif font-black text-text-main mb-6">New Dataset</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-[10px] font-bold uppercase tracking-widest text-text-muted mb-2">Name</label>
                                <input
                                    autoFocus
                                    type="text"
                                    className="w-full bg-app border border-border-base rounded-xl px-4 py-3 text-sm text-text-main focus:ring-2 focus:ring-wispr-purple/20 focus:outline-none transition-all"
                                    placeholder="e.g. Production Gold Set"
                                    value={newDataset.name}
                                    onChange={e => setNewDataset({ ...newDataset, name: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold uppercase tracking-widest text-text-muted mb-2">Description</label>
                                <textarea
                                    className="w-full bg-app border border-border-base rounded-xl px-4 py-3 text-sm text-text-main focus:ring-2 focus:ring-wispr-purple/20 focus:outline-none transition-all h-24 resize-none"
                                    placeholder="What is this dataset for?"
                                    value={newDataset.description}
                                    onChange={e => setNewDataset({ ...newDataset, description: e.target.value })}
                                />
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
                                    onClick={handleCreateDataset}
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
                <div className="flex items-center justify-center py-20 text-text-muted">Loading datasets...</div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {datasets.map(ds => (
                        <div
                            key={ds.id}
                            onClick={() => onSelectDataset(ds)}
                            className="bg-panel border border-border-base p-6 rounded-2xl hover:border-border-hover transition-all group cursor-pointer"
                        >
                            <div className="flex justify-between items-start mb-4">
                                <div className="p-3 bg-wispr-purple/10 rounded-xl">
                                    <CircleStackIcon className="w-6 h-6 text-wispr-purple" />
                                </div>
                                <ChevronRightIcon className="w-5 h-5 text-border-base group-hover:text-text-muted transition-colors" />
                            </div>
                            <h3 className="text-lg font-bold text-text-main mb-1">{ds.name}</h3>
                            <p className="text-text-muted text-xs line-clamp-2 mb-4">{ds.description || 'No description provided.'}</p>
                            <div className="flex items-center gap-4 pt-4 border-t border-border-base/50">
                                <div className="flex flex-col">
                                    <span className="text-[10px] text-text-muted font-bold uppercase tracking-widest opacity-60">Version</span>
                                    <span className="text-sm text-text-main tabular-nums">v{ds.version}</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] text-text-muted font-bold uppercase tracking-widest opacity-60">Created</span>
                                    <span className="text-sm text-text-main">{new Date(ds.created_at).toLocaleDateString()}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {datasets.length === 0 && !loading && (
                <div className="flex flex-col items-center justify-center py-20 bg-panel/30 border-2 border-dashed border-border-base rounded-3xl">
                    <CircleStackIcon className="w-12 h-12 text-border-base mb-4" />
                    <h3 className="text-text-main font-bold">No datasets found</h3>
                    <p className="text-text-muted text-sm mt-1">Create your first dataset to start evaluating your models.</p>
                </div>
            )}
        </div>
    );
};

export default DatasetList;
