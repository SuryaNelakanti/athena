import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Dataset, DatasetRow, DatasetVersion } from '../../types';
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
import { Badge, Button, Card, IconButton, Input, Modal, Tabs, Textarea } from '../ui';
import { PageHeader } from '../layout/PageHeader';

interface DatasetDetailProps {
    dataset: Dataset;
    onBack: () => void;
}

const MAIN_TABS = [
    { id: 'eval', label: 'Eval' },
    { id: 'resources', label: 'Resources' },
    { id: 'history', label: 'History' },
];

const FILTER_TABS = [
    { id: 'all', label: 'All' },
    { id: 'gold', label: 'Gold' },
    { id: 'anti_pattern', label: 'Anti-Pattern' },
];

const EXAMPLE_TABS = [
    { id: 'gold', label: 'Gold Example' },
    { id: 'anti_pattern', label: 'Anti-Pattern' },
];

const DatasetDetail: React.FC<DatasetDetailProps> = ({ dataset, onBack }) => {
    const [rows, setRows] = useState<DatasetRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState<'all' | 'gold' | 'anti_pattern'>('all');
    const [activeTab, setActiveTab] = useState<'eval' | 'resources' | 'history'>('eval');
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

    const getRowKind = (row: DatasetRow) => row.row_kind || 'eval';
    const getEvalLabel = (row: DatasetRow) => row.eval_label || row.example_type || 'gold';

    // Filter rows
    const filteredRows = rows.filter(row => {
        const rowKind = getRowKind(row);
        const evalLabel = getEvalLabel(row);

        if (activeTab === 'eval' && rowKind !== 'eval') return false;
        if (activeTab === 'resources' && rowKind !== 'resource') return false;

        if (activeTab === 'eval' && filterType !== 'all' && evalLabel !== filterType) return false;

        if (!searchQuery.trim()) return true;
        const input = extractText(row.input).toLowerCase();
        const expected = extractExpected(row.expected).toLowerCase();
        return input.includes(searchQuery.toLowerCase()) || expected.includes(searchQuery.toLowerCase());
    });

    const evalRows = rows.filter(r => getRowKind(r) === 'eval');
    const goldCount = evalRows.filter(r => getEvalLabel(r) === 'gold').length;
    const antiPatternCount = evalRows.filter(r => getEvalLabel(r) === 'anti_pattern').length;
    const resourceCount = rows.filter(r => getRowKind(r) === 'resource').length;
    const isEvalTab = activeTab === 'eval';
    const isResourceTab = activeTab === 'resources';

    const handleAddExample = async () => {
        setAddError(null);
        if (!newExample.input.trim()) {
            setAddError('Input is required');
            return;
        }
        const isEvalTab = activeTab === 'eval';
        if (isEvalTab && !newExample.expected.trim()) {
            setAddError('Expected output is required');
            return;
        }

        try {
            await api.addDatasetRow(dataset.id, {
                input: isEvalTab ? { prompt: newExample.input } : { text: newExample.input },
                expected: isEvalTab ? { answer: newExample.expected } : undefined,
                row_kind: isEvalTab ? 'eval' : 'resource',
                eval_label: isEvalTab ? newExample.example_type : undefined,
                example_type: isEvalTab ? newExample.example_type : undefined,
            });
            await loadRows();
            setShowAddModal(false);
            setNewExample({ input: '', expected: '', example_type: 'gold' });
        } catch (e: any) {
            setAddError(e?.message || 'Failed to add example');
        }
    };

    return (
        <><div className="h-full flex flex-col">

            <div className="border-b border-border-hairline shrink-0">
                <PageHeader
                    title={dataset.name}
                    subtitle={dataset.description}
                    onBack={onBack}
                    badge={<div className="flex items-center gap-2 text-xs text-text-muted font-medium mt-0.5">
                        <Badge variant="primary">v{dataset.version}</Badge>
                        {dataset.kind && (
                            <Badge variant="outline" className="uppercase">
                                {dataset.kind}
                            </Badge>
                        )}
                        {(goldCount > 0 || antiPatternCount > 0 || resourceCount > 0) && <span>|</span>}
                        {goldCount > 0 && <span className="text-emerald-500">{goldCount} gold</span>}
                        {antiPatternCount > 0 && (
                            <>
                                <span>|</span>
                                <span className="text-rose-500">{antiPatternCount} anti-patterns</span>
                            </>
                        )}
                        {resourceCount > 0 && (
                            <>
                                <span>|</span>
                                <span className="text-sky-500">{resourceCount} resources</span>
                            </>
                        )}
                    </div>}
                    actions={activeTab !== 'history' && (
                        <Button
                            onClick={() => setShowAddModal(true)}
                            variant="primary"
                            size="sm"
                        >
                            <PlusIcon className="w-4 h-4" /> {activeTab === 'resources' ? 'Add Resource' : 'Add Eval Row'}
                        </Button>
                    )}
                    className="pb-0 border-b-0" />
            </div>

            <div className="px-8 pb-4 pt-4">
                <Card className="bg-primary/5 border-primary/20">
                    <h4 className="text-sm font-bold text-text-main mb-1">What is this dataset?</h4>
                    <p className="text-xs text-text-muted leading-relaxed">
                        Eval rows store <strong className="text-primary">Inputs</strong> and <strong className="text-emerald-500">Expected Outputs</strong>.
                        <strong className="text-emerald-500 ml-1">Gold</strong> entries are correct behaviors.
                        <strong className="text-rose-500 ml-1">Anti-patterns</strong> are outputs the AI should avoid.
                        <span className="ml-1">Resources store reference material for context.</span>
                    </p>
                </Card>
            </div>

            <div className="px-8 pb-4">
                <Tabs
                    options={MAIN_TABS}
                    value={activeTab}
                    onChange={(value) => setActiveTab(value as 'eval' | 'resources' | 'history')} />
            </div>

            {activeTab !== 'history' && (
                <div className="px-8 pb-4 flex gap-4">
                    <div className="relative flex-1">
                        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                        <Input
                            type="text"
                            placeholder={activeTab === 'resources' ? 'Search resources...' : 'Search eval rows...'}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10" />
                    </div>
                    {activeTab === 'eval' && (
                        <Tabs
                            options={FILTER_TABS}
                            value={filterType}
                            onChange={(value) => setFilterType(value as 'all' | 'gold' | 'anti_pattern')} />
                    )}
                </div>
            )}
            <div className="flex-1 overflow-y-auto p-6">
                {activeTab !== 'history' ? (
                    <>
                        {loading ? (
                            <div className="py-20 text-center text-text-muted italic">Loading rows...</div>
                        ) : filteredRows.length === 0 ? (
                            <div className="py-20 text-center">
                                <CircleStackIcon className="w-12 h-12 text-text-muted/30 mx-auto mb-4" />
                                <p className="text-text-muted italic mb-4">
                                    {searchQuery ? 'No rows match your search.' : 'No rows in this dataset yet.'}
                                </p>
                                <Button
                                    onClick={() => setShowAddModal(true)}
                                    variant="outline"
                                    size="sm"
                                    className="text-primary"
                                >
                                    <PlusIcon className="w-4 h-4" /> {isResourceTab ? 'Add Your First Resource' : 'Add Your First Row'}
                                </Button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {filteredRows.map((row, idx) => {
                                    const isExpanded = expandedRowId === row.id;
                                    const inputText = extractText(row.input);
                                    const expectedText = extractExpected(row.expected);
                                    const rowKind = getRowKind(row);
                                    const evalLabel = getEvalLabel(row);
                                    const isAntiPattern = rowKind === 'eval' && evalLabel === 'anti_pattern';
                                    const isResource = rowKind === 'resource';

                                    return (
                                        <div
                                            key={row.id}
                                            className={`bg-panel border rounded-lg overflow-hidden transition-all ${isAntiPattern ? 'border-rose-500/30' : 'border-border-base hover:border-border-hover'}`}
                                        >
                                            {/* Row Header */}
                                            <button
                                                onClick={() => setExpandedRowId(isExpanded ? null : row.id)}
                                                className="w-full px-6 py-4 flex items-start gap-4 text-left hover:bg-panel-hover transition-colors"
                                            >
                                                <div className={`flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center text-xs font-bold ${isAntiPattern
                                                    ? 'bg-rose-500/10 text-rose-500'
                                                    : 'bg-primary/10 text-primary'}`}>
                                                    {isAntiPattern ? <XMarkIcon className="w-4 h-4" /> : idx + 1}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        {isAntiPattern && (
                                                            <Badge variant="danger">Anti-Pattern</Badge>
                                                        )}
                                                        {isResource && (
                                                            <Badge variant="outline">Resource</Badge>
                                                        )}
                                                        {row.source_trace_id && (
                                                            <Badge variant="warning">From Trace</Badge>
                                                        )}
                                                    </div>
                                                    <p className="text-sm text-text-main line-clamp-2 font-medium">{inputText}</p>
                                                    <p className="text-xs text-text-muted mt-1 line-clamp-1">
                                                        <span className={isAntiPattern ? 'text-rose-500 font-medium' : 'text-emerald-500 font-medium'}>
                                                            {isResource ? 'Resource:' : isAntiPattern ? 'Avoid:' : 'Expected:'}
                                                        </span> {isResource ? 'Reference content' : expectedText}
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
                                                    {isResource ? (
                                                        <div className="grid md:grid-cols-1 gap-4">
                                                            <div>
                                                                <div className="flex items-center gap-2 mb-2">
                                                                    <DocumentTextIcon className="w-4 h-4 text-primary" />
                                                                    <span className="text-xs font-bold uppercase tracking-wider text-primary">Resource Content</span>
                                                                </div>
                                                                <div className="bg-app rounded-md border border-border-base p-4">
                                                                    <p className="text-sm text-text-main whitespace-pre-wrap">{inputText}</p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="grid md:grid-cols-2 gap-4">
                                                            {/* Input */}
                                                            <div>
                                                                <div className="flex items-center gap-2 mb-2">
                                                                    <DocumentTextIcon className="w-4 h-4 text-primary" />
                                                                    <span className="text-xs font-bold uppercase tracking-wider text-primary">Input (Prompt)</span>
                                                                </div>
                                                                <div className="bg-app rounded-md border border-border-base p-4">
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
                                                                <div className={`rounded-md p-4 ${isAntiPattern
                                                                    ? 'bg-rose-500/5 border border-rose-500/20'
                                                                    : 'bg-emerald-500/5 border border-emerald-500/20'}`}>
                                                                    <p className="text-sm text-text-main whitespace-pre-wrap">{expectedText}</p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
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
                                        <Card key={entry.id} padded={false} className="overflow-hidden">
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
                                                                    <div className="bg-app border border-border-base rounded-md p-3 text-xs text-text-main whitespace-pre-wrap">
                                                                        {`${extractText(previousRow.input)}\n\nExpected: ${extractExpected(previousRow.expected)}`}
                                                                    </div>
                                                                </div>
                                                            )}
                                                            {currentRow && (
                                                                <div>
                                                                    <div className="text-[10px] uppercase tracking-wider text-text-muted font-bold mb-2">Current</div>
                                                                    <div className="bg-app border border-border-base rounded-md p-3 text-xs text-text-main whitespace-pre-wrap">
                                                                        {`${extractText(currentRow.input)}\n\nExpected: ${extractExpected(currentRow.expected)}`}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </Card>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
            <Modal
                open={showAddModal}
                title={isResourceTab ? 'Add Resource' : 'Add Eval Row'}
                description={isResourceTab ? 'Store reference material for context.' : 'Create an input-output pair for testing.'}
                onClose={() => setShowAddModal(false)}
                footer={<div className="flex items-center justify-end gap-2">
                    <Button variant="secondary" size="sm" onClick={() => setShowAddModal(false)}>
                        Cancel
                    </Button>
                    <Button
                        variant={isEvalTab ? (newExample.example_type === 'gold' ? 'success' : 'danger') : 'primary'}
                        size="sm"
                        onClick={handleAddExample}
                    >
                        {isEvalTab
                            ? (newExample.example_type === 'gold' ? 'Add Gold Example' : 'Add Anti-Pattern')
                            : 'Add Resource'}
                    </Button>
                </div>}
                className="max-w-xl"
            >
                <div className="space-y-4">
                    {addError && (
                        <div className="text-xs text-rose-500 font-semibold bg-rose-500/10 rounded-md p-3">{addError}</div>
                    )}

                    {isEvalTab && (
                        <div>
                            <label className="block text-[11px] font-medium text-text-muted mb-2">Example Type</label>
                            <Tabs
                                options={EXAMPLE_TABS}
                                value={newExample.example_type}
                                onChange={(value) => setNewExample(p => ({ ...p, example_type: value as 'gold' | 'anti_pattern' }))} />
                            <p className="text-[11px] text-text-muted mt-2">
                                {newExample.example_type === 'gold'
                                    ? 'Gold entries show correct AI behavior.'
                                    : 'Anti-patterns show outputs the AI should avoid.'}
                            </p>
                        </div>
                    )}

                    <div>
                        <label className="block text-[11px] font-medium text-text-muted mb-2">
                            {isResourceTab ? 'Resource Content' : 'Input (Prompt / Question)'}
                        </label>
                        <Textarea
                            value={newExample.input}
                            onChange={(e) => setNewExample(p => ({ ...p, input: e.target.value }))}
                            className="h-28 resize-none"
                            placeholder={isResourceTab ? 'Paste the reference content or notes here.' : 'What question or prompt should be given to the AI?'} />
                    </div>

                    {isEvalTab && (
                        <div>
                            <label className="block text-[11px] font-medium text-text-muted mb-2">
                                {newExample.example_type === 'gold' ? 'Expected Output (Correct Answer)' : 'Anti-Pattern Output (What to Avoid)'}
                            </label>
                            <Textarea
                                value={newExample.expected}
                                onChange={(e) => setNewExample(p => ({ ...p, expected: e.target.value }))}
                                className={`h-28 resize-none ${newExample.example_type === 'gold'
                                    ? 'bg-emerald-500/5 border-emerald-500/30 focus:ring-emerald-500/20 focus:border-emerald-500/50'
                                    : 'bg-rose-500/5 border-rose-500/30 focus:ring-rose-500/20 focus:border-rose-500/50'}`}
                                placeholder={newExample.example_type === 'gold'
                                    ? "What's the correct response?"
                                    : "What output should the AI avoid?"} />
                        </div>
                    )}
                </div>
            </Modal>
        </>
    );
    // </div >
};

export default DatasetDetail;

