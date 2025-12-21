import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Dataset, DatasetRow, DatasetVersion } from '../types';
import {
    ChevronLeftIcon,
    CircleStackIcon,
    ChevronDownIcon,
    ChevronRightIcon,
    DocumentTextIcon,
    CheckCircleIcon,
    MagnifyingGlassIcon,
    PlusIcon,
    XMarkIcon,
    ExclamationTriangleIcon
} from '@heroicons/react/24/outline';

interface DatasetDetailProps {
    dataset: Dataset;
    onBack: () => void;
}

const DatasetDetail: React.FC<DatasetDetailProps> = ({ dataset, onBack }) => {
    const [rows, setRows] = useState<DatasetRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState<'all' | 'gold' | 'anti_pattern'>('all');
    const [activeTab, setActiveTab] = useState<'examples' | 'history'>('examples');
    const [history, setHistory] = useState<DatasetVersion[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
    const [rowHistory, setRowHistory] = useState<Record<string, DatasetRow[]>>({});

    // Add Example Modal State
    const [showAddModal, setShowAddModal] = useState(false);
    const [newExample, setNewExample] = useState({
        input: '',
        expected: '',
        example_type: 'gold' as 'gold' | 'anti_pattern',
    });
    const [addError, setAddError] = useState<string | null>(null);

    const loadRows = async () => {
        setLoading(true);
        try {
            const data = await api.getDatasetRows(dataset.id);
            setRows(data);
        } finally {
            setLoading(false);
        }
    };

    const loadHistory = async () => {
        setHistoryLoading(true);
        try {
            const data = await api.getDatasetHistory(dataset.id);
            setHistory(data);
        } finally {
            setHistoryLoading(false);
        }
    };

    useEffect(() => {
        loadRows();
    }, [dataset.id]);

    useEffect(() => {
        setRowHistory({});
        setExpandedHistoryId(null);
    }, [dataset.id]);

    useEffect(() => {
        if (activeTab === 'history') {
            loadHistory();
        }
    }, [dataset.id, activeTab]);

    // Extract human-readable text from input/expected objects
    const extractText = (obj: any): string => {
        if (typeof obj === 'string') return obj;
        if (!obj || typeof obj !== 'object') return '';
        for (const key of ['prompt', 'input', 'text', 'query', 'question', 'content']) {
            if (typeof obj[key] === 'string') return obj[key];
        }
        if (Array.isArray(obj.messages)) {
            const userMsg = obj.messages.find((m: any) => m.role === 'user');
            if (userMsg?.content) return userMsg.content;
        }
        return JSON.stringify(obj);
    };

    const extractExpected = (obj: any): string => {
        if (typeof obj === 'string') return obj;
        if (!obj || typeof obj !== 'object') return '';
        for (const key of ['answer', 'expected', 'text', 'content', 'response']) {
            if (typeof obj[key] === 'string') return obj[key];
        }
        return JSON.stringify(obj);
    };

    const handleToggleHistory = async (entry: DatasetVersion) => {
        if (expandedHistoryId === entry.id) {
            setExpandedHistoryId(null);
            return;
        }
        setExpandedHistoryId(entry.id);
        if (entry.logical_id && !rowHistory[entry.logical_id]) {
            try {
                const rows = await api.getDatasetRowHistory(dataset.id, entry.logical_id);
                setRowHistory((prev) => ({ ...prev, [entry.logical_id as string]: rows }));
            } catch {
                // ignore history load errors
            }
        }
    };

    // Filter rows
    const filteredRows = rows.filter(row => {
        // Type filter
        if (filterType !== 'all' && row.example_type !== filterType) return false;
        // Search filter
        if (!searchQuery.trim()) return true;
        const input = extractText(row.input).toLowerCase();
        const expected = extractExpected(row.expected).toLowerCase();
        return input.includes(searchQuery.toLowerCase()) || expected.includes(searchQuery.toLowerCase());
    });

    const goldCount = rows.filter(r => r.example_type === 'gold' || !r.example_type).length;
    const antiPatternCount = rows.filter(r => r.example_type === 'anti_pattern').length;

    const handleAddExample = async () => {
        setAddError(null);
        if (!newExample.input.trim()) {
            setAddError('Input is required');
            return;
        }
        if (!newExample.expected.trim()) {
            setAddError('Expected output is required');
            return;
        }

        try {
            await api.addDatasetRow(dataset.id, {
                input: { prompt: newExample.input },
                expected: { answer: newExample.expected },
                example_type: newExample.example_type,
            });
            await loadRows();
            setShowAddModal(false);
            setNewExample({ input: '', expected: '', example_type: 'gold' });
        } catch (e: any) {
            setAddError(e?.message || 'Failed to add example');
        }
    };

    return (
        <div className="h-full flex flex-col bg-app transition-colors duration-300">
            {/* Header */}
            <div className="border-b border-border-base bg-panel shrink-0">
                <div className="px-8 py-6">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-4">
                            <button onClick={onBack} className="p-2 -ml-2 rounded-xl text-text-muted hover:text-text-main hover:bg-panel-hover transition-all">
                                <ChevronLeftIcon className="w-5 h-5" />
                            </button>
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-wispr-purple to-wispr-purple-dark flex items-center justify-center">
                                    <CircleStackIcon className="w-5 h-5 text-white" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-serif font-black text-text-main leading-tight">{dataset.name}</h2>
                                    <div className="flex items-center gap-2 text-xs text-text-muted font-medium mt-0.5">
                                        <span className="px-1.5 py-0.5 bg-wispr-purple/10 text-wispr-purple rounded font-bold">v{dataset.version}</span>
                                        <span>•</span>
                                        <span className="text-emerald-500">{goldCount} gold</span>
                                        {antiPatternCount > 0 && (
                                            <>
                                                <span>•</span>
                                                <span className="text-rose-500">{antiPatternCount} anti-patterns</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={() => setShowAddModal(true)}
                            className="flex items-center gap-2 px-4 py-2.5 bg-wispr-purple text-white rounded-xl text-sm font-bold shadow-lg shadow-wispr-purple/20 hover:bg-wispr-purple-dark transition-all"
                        >
                            <PlusIcon className="w-4 h-4" /> Add Example
                        </button>
                    </div>
                    {dataset.description && (
                        <p className="text-text-muted text-sm max-w-3xl leading-relaxed">{dataset.description}</p>
                    )}
                </div>

                {/* Explanation Banner */}
                <div className="px-8 pb-4">
                    <div className="bg-gradient-to-r from-wispr-purple/5 to-transparent border border-wispr-purple/20 rounded-xl p-4">
                        <h4 className="text-sm font-bold text-text-main mb-1">📊 What is this dataset?</h4>
                        <p className="text-xs text-text-muted leading-relaxed">
                            Each row has an <strong className="text-wispr-purple">Input</strong> (the prompt) and an <strong className="text-emerald-500">Expected Output</strong> (the ideal response).
                            <strong className="text-emerald-500 ml-1">✓ Gold examples</strong> are correct behaviors.
                            <strong className="text-rose-500 ml-1">✗ Anti-patterns</strong> are outputs the AI should avoid.
                        </p>
                    </div>
                </div>

                <div className="px-8 pb-4">
                    <div className="flex rounded-xl border border-border-base overflow-hidden w-max">
                        <button
                            onClick={() => setActiveTab('examples')}
                            className={`px-4 py-2 text-xs font-bold ${activeTab === 'examples' ? 'bg-wispr-purple text-white' : 'bg-panel text-text-muted hover:bg-panel-hover'}`}
                        >
                            Examples
                        </button>
                        <button
                            onClick={() => setActiveTab('history')}
                            className={`px-4 py-2 text-xs font-bold ${activeTab === 'history' ? 'bg-wispr-purple text-white' : 'bg-panel text-text-muted hover:bg-panel-hover'}`}
                        >
                            History
                        </button>
                    </div>
                </div>

                {activeTab === 'examples' && (
                    <div className="px-8 pb-4 flex gap-4">
                        <div className="relative flex-1">
                            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                            <input
                                type="text"
                                placeholder="Search examples..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-app border border-border-base rounded-xl pl-10 pr-4 py-2.5 text-sm text-text-main placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-wispr-purple/20 focus:border-wispr-purple/50"
                            />
                        </div>
                        <div className="flex rounded-xl border border-border-base overflow-hidden">
                            <button
                                onClick={() => setFilterType('all')}
                                className={`px-4 py-2 text-xs font-bold ${filterType === 'all' ? 'bg-wispr-purple text-white' : 'bg-panel text-text-muted hover:bg-panel-hover'}`}
                            >
                                All
                            </button>
                            <button
                                onClick={() => setFilterType('gold')}
                                className={`px-4 py-2 text-xs font-bold ${filterType === 'gold' ? 'bg-emerald-500 text-white' : 'bg-panel text-text-muted hover:bg-panel-hover'}`}
                            >
                                ✓ Gold
                            </button>
                            <button
                                onClick={() => setFilterType('anti_pattern')}
                                className={`px-4 py-2 text-xs font-bold ${filterType === 'anti_pattern' ? 'bg-rose-500 text-white' : 'bg-panel text-text-muted hover:bg-panel-hover'}`}
                            >
                                ✗ Anti
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Examples List */}
            <div className="flex-1 overflow-y-auto p-8">
                {activeTab === 'examples' ? (
                    <>
                        {loading ? (
                            <div className="py-20 text-center text-text-muted italic">Loading examples...</div>
                        ) : filteredRows.length === 0 ? (
                            <div className="py-20 text-center">
                                <CircleStackIcon className="w-12 h-12 text-text-muted/30 mx-auto mb-4" />
                                <p className="text-text-muted italic mb-4">
                                    {searchQuery ? 'No examples match your search.' : 'No examples in this dataset yet.'}
                                </p>
                                <button
                                    onClick={() => setShowAddModal(true)}
                                    className="inline-flex items-center gap-2 px-4 py-2 bg-wispr-purple/10 text-wispr-purple rounded-xl text-sm font-bold hover:bg-wispr-purple/20 transition-all"
                                >
                                    <PlusIcon className="w-4 h-4" /> Add Your First Example
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {filteredRows.map((row, idx) => {
                                    const isExpanded = expandedRowId === row.id;
                                    const inputText = extractText(row.input);
                                    const expectedText = extractExpected(row.expected);
                                    const isAntiPattern = row.example_type === 'anti_pattern';

                                    return (
                                        <div
                                            key={row.id}
                                            className={`bg-panel border rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all ${isAntiPattern ? 'border-rose-500/30' : 'border-border-base'
                                                }`}
                                        >
                                            {/* Row Header */}
                                            <button
                                                onClick={() => setExpandedRowId(isExpanded ? null : row.id)}
                                                className="w-full px-6 py-4 flex items-start gap-4 text-left hover:bg-panel-hover transition-colors"
                                            >
                                                <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${isAntiPattern
                                                    ? 'bg-rose-500/10 text-rose-500'
                                                    : 'bg-wispr-purple/10 text-wispr-purple'
                                                    }`}>
                                                    {isAntiPattern ? <XMarkIcon className="w-4 h-4" /> : idx + 1}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        {isAntiPattern && (
                                                            <span className="text-[9px] bg-rose-500/20 text-rose-500 px-1.5 py-0.5 rounded-full font-bold uppercase">Anti-Pattern</span>
                                                        )}
                                                        {row.source_trace_id && (
                                                            <span className="text-[9px] bg-amber-500/20 text-amber-600 px-1.5 py-0.5 rounded-full font-medium">From Trace</span>
                                                        )}
                                                    </div>
                                                    <p className="text-sm text-text-main line-clamp-2 font-medium">{inputText}</p>
                                                    <p className="text-xs text-text-muted mt-1 line-clamp-1">
                                                        <span className={isAntiPattern ? 'text-rose-500 font-medium' : 'text-emerald-500 font-medium'}>
                                                            {isAntiPattern ? 'Avoid:' : 'Expected:'}
                                                        </span> {expectedText}
                                                    </p>
                                                </div>
                                                <div className="flex-shrink-0">
                                                    {isExpanded ? (
                                                        <ChevronDownIcon className="w-5 h-5 text-text-muted" />
                                                    ) : (
                                                        <ChevronRightIcon className="w-5 h-5 text-text-muted" />
                                                    )}
                                                </div>
                                            </button>

                                            {/* Expanded Content */}
                                            {isExpanded && (
                                                <div className="px-6 pb-6 pt-2 border-t border-border-base/50">
                                                    <div className="grid md:grid-cols-2 gap-4">
                                                        {/* Input */}
                                                        <div>
                                                            <div className="flex items-center gap-2 mb-2">
                                                                <DocumentTextIcon className="w-4 h-4 text-wispr-purple" />
                                                                <span className="text-xs font-bold uppercase tracking-wider text-wispr-purple">Input (Prompt)</span>
                                                            </div>
                                                            <div className="bg-app rounded-xl border border-border-base p-4">
                                                                <p className="text-sm text-text-main whitespace-pre-wrap">{inputText}</p>
                                                            </div>
                                                        </div>

                                                        {/* Expected */}
                                                        <div>
                                                            <div className="flex items-center gap-2 mb-2">
                                                                {isAntiPattern ? (
                                                                    <>
                                                                        <ExclamationTriangleIcon className="w-4 h-4 text-rose-500" />
                                                                        <span className="text-xs font-bold uppercase tracking-wider text-rose-500">Anti-Pattern (Avoid This)</span>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <CheckCircleIcon className="w-4 h-4 text-emerald-500" />
                                                                        <span className="text-xs font-bold uppercase tracking-wider text-emerald-500">Expected Output</span>
                                                                    </>
                                                                )}
                                                            </div>
                                                            <div className={`rounded-xl p-4 ${isAntiPattern
                                                                ? 'bg-rose-500/5 border border-rose-500/20'
                                                                : 'bg-emerald-500/5 border border-emerald-500/20'
                                                                }`}>
                                                                <p className="text-sm text-text-main whitespace-pre-wrap">{expectedText}</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </>
                ) : (
                    <div>
                        {historyLoading ? (
                            <div className="py-20 text-center text-text-muted italic">Loading history...</div>
                        ) : history.length === 0 ? (
                            <div className="py-20 text-center text-text-muted italic">No history yet.</div>
                        ) : (
                            <div className="space-y-3">
                                {history.map((entry) => {
                                    const isExpanded = expandedHistoryId === entry.id;
                                    const rowsForLogical = entry.logical_id ? rowHistory[entry.logical_id] : undefined;
                                    const currentRow = rowsForLogical?.find((r) => r.id === entry.row_id) || rowsForLogical?.[rowsForLogical.length - 1];
                                    const currentIndex = currentRow && rowsForLogical ? rowsForLogical.findIndex((r) => r.id === currentRow.id) : -1;
                                    const previousRow = currentIndex > 0 && rowsForLogical ? rowsForLogical[currentIndex - 1] : null;

                                    return (
                                        <div key={entry.id} className="bg-panel border border-border-base rounded-2xl overflow-hidden">
                                            <button
                                                onClick={() => handleToggleHistory(entry)}
                                                className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-panel-hover transition-colors"
                                            >
                                                <div>
                                                    <div className="text-xs text-text-muted uppercase tracking-wider">Version {entry.version}</div>
                                                    <div className="text-sm font-bold text-text-main">{entry.action}</div>
                                                    <div className="text-[10px] text-text-muted mt-1">{new Date(entry.created_at).toLocaleString()}</div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {entry.action === 'flush' && (
                                                        <span className="text-[10px] text-amber-500 font-bold">Flush</span>
                                                    )}
                                                    {isExpanded ? (
                                                        <ChevronDownIcon className="w-5 h-5 text-text-muted" />
                                                    ) : (
                                                        <ChevronRightIcon className="w-5 h-5 text-text-muted" />
                                                    )}
                                                </div>
                                            </button>
                                            {isExpanded && entry.logical_id && (
                                                <div className="px-5 pb-5 pt-2 border-t border-border-base/50">
                                                    {!rowsForLogical ? (
                                                        <div className="text-xs text-text-muted italic">Loading row history...</div>
                                                    ) : (
                                                        <div className="grid md:grid-cols-2 gap-4">
                                                            {previousRow && (
                                                                <div>
                                                                    <div className="text-[10px] uppercase tracking-wider text-text-muted font-bold mb-2">Previous</div>
                                                                    <div className="bg-app border border-border-base rounded-xl p-3 text-xs text-text-main whitespace-pre-wrap">
                                                                        {`${extractText(previousRow.input)}\n\nExpected: ${extractExpected(previousRow.expected)}`}
                                                                    </div>
                                                                </div>
                                                            )}
                                                            {currentRow && (
                                                                <div>
                                                                    <div className="text-[10px] uppercase tracking-wider text-text-muted font-bold mb-2">Current</div>
                                                                    <div className="bg-app border border-border-base rounded-xl p-3 text-xs text-text-main whitespace-pre-wrap">
                                                                        {`${extractText(currentRow.input)}\n\nExpected: ${extractExpected(currentRow.expected)}`}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Add Example Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-panel border border-border-base rounded-3xl shadow-2xl w-full max-w-xl">
                        <div className="p-6 border-b border-border-base">
                            <h3 className="text-lg font-serif font-black text-text-main">Add Example</h3>
                            <p className="text-xs text-text-muted mt-1">Create an input-output pair for testing</p>
                        </div>
                        <div className="p-6 space-y-4">
                            {addError && (
                                <div className="text-xs text-rose-500 font-bold bg-rose-500/10 rounded-xl p-3">{addError}</div>
                            )}

                            {/* Example Type Toggle */}
                            <div>
                                <label className="block text-[10px] font-bold uppercase tracking-widest text-text-muted mb-2">Example Type</label>
                                <div className="flex rounded-xl border border-border-base overflow-hidden">
                                    <button
                                        type="button"
                                        onClick={() => setNewExample(p => ({ ...p, example_type: 'gold' }))}
                                        className={`flex-1 px-4 py-3 text-sm font-bold flex items-center justify-center gap-2 ${newExample.example_type === 'gold'
                                            ? 'bg-emerald-500 text-white'
                                            : 'bg-app text-text-muted hover:bg-panel-hover'
                                            }`}
                                    >
                                        <CheckCircleIcon className="w-4 h-4" /> Gold Example
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setNewExample(p => ({ ...p, example_type: 'anti_pattern' }))}
                                        className={`flex-1 px-4 py-3 text-sm font-bold flex items-center justify-center gap-2 ${newExample.example_type === 'anti_pattern'
                                            ? 'bg-rose-500 text-white'
                                            : 'bg-app text-text-muted hover:bg-panel-hover'
                                            }`}
                                    >
                                        <XMarkIcon className="w-4 h-4" /> Anti-Pattern
                                    </button>
                                </div>
                                <p className="text-[10px] text-text-muted mt-2">
                                    {newExample.example_type === 'gold'
                                        ? '✓ Gold examples show correct AI behavior'
                                        : '✗ Anti-patterns show outputs the AI should avoid'}
                                </p>
                            </div>

                            {/* Input */}
                            <div>
                                <label className="block text-[10px] font-bold uppercase tracking-widest text-text-muted mb-2">Input (Prompt / Question)</label>
                                <textarea
                                    value={newExample.input}
                                    onChange={(e) => setNewExample(p => ({ ...p, input: e.target.value }))}
                                    className="w-full bg-app border border-border-base rounded-xl px-4 py-3 text-sm text-text-main h-28 resize-none focus:outline-none focus:ring-2 focus:ring-wispr-purple/20 focus:border-wispr-purple/50"
                                    placeholder="What question or prompt should be given to the AI?"
                                />
                            </div>

                            {/* Expected */}
                            <div>
                                <label className="block text-[10px] font-bold uppercase tracking-widest text-text-muted mb-2">
                                    {newExample.example_type === 'gold' ? 'Expected Output (Correct Answer)' : 'Anti-Pattern Output (What to Avoid)'}
                                </label>
                                <textarea
                                    value={newExample.expected}
                                    onChange={(e) => setNewExample(p => ({ ...p, expected: e.target.value }))}
                                    className={`w-full border rounded-xl px-4 py-3 text-sm text-text-main h-28 resize-none focus:outline-none focus:ring-2 ${newExample.example_type === 'gold'
                                        ? 'bg-emerald-500/5 border-emerald-500/30 focus:ring-emerald-500/20 focus:border-emerald-500/50'
                                        : 'bg-rose-500/5 border-rose-500/30 focus:ring-rose-500/20 focus:border-rose-500/50'
                                        }`}
                                    placeholder={newExample.example_type === 'gold'
                                        ? "What's the correct response?"
                                        : "What output should the AI avoid?"}
                                />
                            </div>

                            <div className="flex gap-4 pt-2">
                                <button
                                    onClick={() => setShowAddModal(false)}
                                    className="flex-1 px-4 py-3 bg-app border border-border-base rounded-xl text-sm font-bold text-text-muted hover:text-text-main transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleAddExample}
                                    className={`flex-1 px-4 py-3 text-white rounded-xl text-sm font-bold shadow-lg transition-all ${newExample.example_type === 'gold'
                                        ? 'bg-emerald-500 shadow-emerald-500/20 hover:bg-emerald-600'
                                        : 'bg-rose-500 shadow-rose-500/20 hover:bg-rose-600'
                                        }`}
                                >
                                    {newExample.example_type === 'gold' ? '✓ Add Gold Example' : '✗ Add Anti-Pattern'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DatasetDetail;
