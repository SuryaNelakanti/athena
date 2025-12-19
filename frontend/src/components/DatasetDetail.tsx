import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Dataset, DatasetRow } from '../types';
import {
    ChevronLeftIcon,
    CircleStackIcon,
    CalendarIcon,
    TagIcon,
    TableCellsIcon
} from '@heroicons/react/24/outline';

interface DatasetDetailProps {
    dataset: Dataset;
    onBack: () => void;
}

const DatasetDetail: React.FC<DatasetDetailProps> = ({ dataset, onBack }) => {
    const [rows, setRows] = useState<DatasetRow[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.getDatasetRows(dataset.id).then(setRows).finally(() => setLoading(false));
    }, [dataset.id]);

    return (
        <div className="h-full flex flex-col bg-app transition-colors duration-300">
            {/* Header */}
            <div className="h-20 border-b border-border-base flex items-center justify-between px-8 bg-app shrink-0">
                <div className="flex items-center gap-6">
                    <button onClick={onBack} className="p-2 -ml-2 rounded-xl text-text-muted hover:text-text-main hover:bg-panel-hover transition-all">
                        <ChevronLeftIcon className="w-5 h-5" />
                    </button>
                    <div className="flex flex-col">
                        <h2 className="text-xl font-serif font-black text-text-main leading-tight">{dataset.name}</h2>
                        <div className="flex items-center gap-3 text-xs text-text-muted font-medium mt-0.5">
                            <span className="opacity-70">v{dataset.version}</span>
                            <span className="w-1 h-1 rounded-full bg-border-hover"></span>
                            <span>{new Date(dataset.created_at).toLocaleDateString()}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8">
                <div className="mb-8">
                    <h3 className="text-sm font-bold text-text-main mb-2 tracking-tight">Description</h3>
                    <p className="text-text-muted text-sm max-w-2xl">{dataset.description || 'No description provided.'}</p>
                </div>

                <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-text-main tracking-tight uppercase tracking-widest text-[10px] opacity-60">Records ({rows.length})</h3>
                </div>

                {loading ? (
                    <div className="py-20 text-center text-text-muted italic">Loading records...</div>
                ) : (
                    <div className="border border-border-base rounded-2xl overflow-hidden bg-panel shadow-sm">
                        <div className="grid grid-cols-12 gap-4 px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-text-muted border-b border-border-base bg-app/50">
                            <div className="col-span-1">#</div>
                            <div className="col-span-5">Input</div>
                            <div className="col-span-5">Expected</div>
                        </div>
                        <div className="divide-y divide-border-base/50">
                            {rows.map((row, idx) => (
                                <div key={row.id} className="grid grid-cols-12 gap-4 px-6 py-4 text-xs text-text-main hover:bg-panel-hover transition-colors">
                                    <div className="col-span-1 opacity-50 tabular-nums">{idx + 1}</div>
                                    <div className="col-span-5">
                                        <div className="bg-app/50 p-2 rounded-lg border border-border-base/50 max-h-24 overflow-y-auto text-[10px]">
                                            {JSON.stringify(row.input, null, 2)}
                                        </div>
                                    </div>
                                    <div className="col-span-5">
                                        <div className="bg-app/50 p-2 rounded-lg border border-border-base/50 max-h-24 overflow-y-auto text-[10px]">
                                            {JSON.stringify(row.expected, null, 2)}
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {rows.length === 0 && (
                                <div className="py-20 text-center text-text-muted italic text-sm">No records in this dataset yet.</div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DatasetDetail;
