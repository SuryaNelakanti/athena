import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { Function } from '../types';
import {
    CpuChipIcon,
    PlusIcon,
    SparklesIcon,
    CodeBracketIcon,
    ChatBubbleLeftRightIcon,
    TrashIcon,
    CheckCircleIcon,
    XCircleIcon,
} from '@heroicons/react/24/outline';
import { Badge, Button, Card, Input, Modal, Select, Textarea } from '../components/ui';
import { PageHeader } from '../layouts/PageHeader';

interface FunctionsListProps {
    projectId: string;
}

const runtimeIcon = (runtime: string) => {
    switch (runtime) {
        case 'llm_judge':
            return <ChatBubbleLeftRightIcon className="w-4 h-4" />;
        case 'python':
            return <CodeBracketIcon className="w-4 h-4" />;
        default:
            return <CpuChipIcon className="w-4 h-4" />;
    }
};

const runtimeBadge = (runtime: string): 'neutral' | 'primary' | 'success' | 'warning' => {
    switch (runtime) {
        case 'llm_judge':
            return 'primary';
        case 'python':
            return 'warning';
        default:
            return 'neutral';
    }
};

const FunctionsList: React.FC<FunctionsListProps> = ({ projectId }) => {
    const [functions, setFunctions] = useState<Function[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [filter, setFilter] = useState<'all' | 'scorer' | 'tool'>('all');
    const [newFunction, setNewFunction] = useState({
        name: '',
        display_name: '',
        description: '',
        type: 'scorer',
        runtime: 'llm_judge',
        config: {} as Record<string, any>,
    });
    const [llmJudgeCriteria, setLlmJudgeCriteria] = useState('');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadFunctions();
    }, [projectId]);

    const loadFunctions = async () => {
        setLoading(true);
        try {
            const data = await api.getFunctions(projectId);
            setFunctions(data);
        } catch (e) {
            console.error('Failed to load functions', e);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateFunction = async () => {
        if (!newFunction.name.trim()) return;
        setError(null);
        try {
            const config = newFunction.runtime === 'llm_judge'
                ? { criteria: llmJudgeCriteria, model: 'gpt-4o-mini' }
                : newFunction.config;

            await api.createFunction(projectId, {
                name: newFunction.name,
                display_name: newFunction.display_name || undefined,
                description: newFunction.description || undefined,
                type: newFunction.type,
                runtime: newFunction.runtime,
                config,
                enabled: true,
            });
            setNewFunction({
                name: '',
                display_name: '',
                description: '',
                type: 'scorer',
                runtime: 'llm_judge',
                config: {},
            });
            setLlmJudgeCriteria('');
            setShowCreateModal(false);
            loadFunctions();
        } catch (e: any) {
            setError(e.message || 'Failed to create function');
        }
    };

    const handleDeleteFunction = async (id: string) => {
        try {
            await api.deleteFunction(id);
            loadFunctions();
        } catch (e: any) {
            console.error('Failed to delete function', e);
        }
    };

    const filteredFunctions = functions.filter((fn) => {
        if (filter === 'all') return true;
        return fn.type === filter;
    });

    const builtinFunctions = filteredFunctions.filter((fn) => !fn.project_id);
    const customFunctions = filteredFunctions.filter((fn) => fn.project_id);

    return (
        <div className="h-full flex flex-col bg-app">
            <PageHeader
                title="Functions"
                subtitle="Scorers and tools for evaluation and automation"
                actions={
                    <Button variant="primary" size="sm" onClick={() => setShowCreateModal(true)}>
                        <PlusIcon className="w-3.5 h-3.5" />
                        New Function
                    </Button>
                }
            />

            {/* Filters */}
            <div className="px-6 py-3 border-b border-border-hairline bg-panel flex items-center gap-3">
                <span className="text-xs text-text-muted font-medium">Filter:</span>
                <div className="flex gap-1">
                    {(['all', 'scorer', 'tool'] as const).map((f) => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${filter === f
                                    ? 'bg-primary/10 text-primary'
                                    : 'text-text-muted hover:bg-panel-hover hover:text-text-main'
                                }`}
                        >
                            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1) + 's'}
                        </button>
                    ))}
                </div>
                <div className="ml-auto text-xs text-text-muted">
                    {filteredFunctions.length} function{filteredFunctions.length !== 1 ? 's' : ''}
                </div>
            </div>

            {/* Create Modal */}
            <Modal
                open={showCreateModal}
                title="New Function"
                description="Create a custom scorer or tool function."
                onClose={() => setShowCreateModal(false)}
                footer={
                    <div className="flex items-center justify-end gap-2">
                        <Button variant="secondary" size="sm" onClick={() => setShowCreateModal(false)}>
                            Cancel
                        </Button>
                        <Button variant="primary" size="sm" onClick={handleCreateFunction}>
                            Create
                        </Button>
                    </div>
                }
            >
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[11px] font-medium text-text-muted mb-2">Name</label>
                            <Input
                                autoFocus
                                placeholder="e.g. policy_compliance"
                                value={newFunction.name}
                                onChange={(e) => setNewFunction({ ...newFunction, name: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-[11px] font-medium text-text-muted mb-2">Display Name</label>
                            <Input
                                placeholder="e.g. Policy Compliance"
                                value={newFunction.display_name}
                                onChange={(e) => setNewFunction({ ...newFunction, display_name: e.target.value })}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-[11px] font-medium text-text-muted mb-2">Description</label>
                        <Textarea
                            className="h-16 resize-none"
                            placeholder="What does this function do?"
                            value={newFunction.description}
                            onChange={(e) => setNewFunction({ ...newFunction, description: e.target.value })}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[11px] font-medium text-text-muted mb-2">Type</label>
                            <Select
                                value={newFunction.type}
                                onChange={(e) => setNewFunction({ ...newFunction, type: e.target.value })}
                            >
                                <option value="scorer">Scorer</option>
                                <option value="tool">Tool</option>
                            </Select>
                        </div>
                        <div>
                            <label className="block text-[11px] font-medium text-text-muted mb-2">Runtime</label>
                            <Select
                                value={newFunction.runtime}
                                onChange={(e) => setNewFunction({ ...newFunction, runtime: e.target.value })}
                            >
                                <option value="llm_judge">LLM Judge</option>
                                <option value="python">Python</option>
                                <option value="builtin">Built-in</option>
                            </Select>
                        </div>
                    </div>
                    {newFunction.runtime === 'llm_judge' && (
                        <div>
                            <label className="block text-[11px] font-medium text-text-muted mb-2">
                                Evaluation Criteria
                            </label>
                            <Textarea
                                className="h-24 resize-none font-mono text-xs"
                                placeholder="Rate the response on accuracy, helpfulness, and policy compliance. Return a score from 0-1."
                                value={llmJudgeCriteria}
                                onChange={(e) => setLlmJudgeCriteria(e.target.value)}
                            />
                        </div>
                    )}
                    {error && <p className="text-xs text-rose-500 font-medium">{error}</p>}
                </div>
            </Modal>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {loading ? (
                    <div className="flex items-center justify-center py-20 text-text-muted text-sm animate-pulse">
                        Loading functions...
                    </div>
                ) : filteredFunctions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 animate-soft-in">
                        <div className="icon-chip icon-chip--indigo icon-chip-lg mb-4">
                            <CpuChipIcon className="w-5 h-5" />
                        </div>
                        <h3 className="text-text-main font-semibold mb-1">No functions yet</h3>
                        <p className="text-text-muted text-sm mb-4">Create scorers and tools for your evaluations</p>
                        <Button variant="primary" size="sm" onClick={() => setShowCreateModal(true)}>
                            <PlusIcon className="w-3.5 h-3.5" />
                            Create Function
                        </Button>
                    </div>
                ) : (
                    <>
                        {/* Built-in Functions */}
                        {builtinFunctions.length > 0 && (
                            <section className="animate-soft-in">
                                <div className="flex items-center gap-2 mb-4">
                                    <SparklesIcon className="w-4 h-4 text-amber-500" />
                                    <h2 className="text-sm font-semibold text-text-main">Built-in Functions</h2>
                                    <Badge variant="neutral" className="text-[9px]">
                                        {builtinFunctions.length}
                                    </Badge>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {builtinFunctions.map((fn, idx) => (
                                        <Card
                                            key={fn.id}
                                            className="animate-soft-in"
                                            style={{ animationDelay: `${idx * 30}ms` }}
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className="icon-chip icon-chip--amber shrink-0">
                                                    {runtimeIcon(fn.runtime)}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <h3 className="text-sm font-semibold text-text-main truncate">
                                                            {fn.display_name || fn.name}
                                                        </h3>
                                                        <Badge variant={runtimeBadge(fn.runtime)} className="text-[9px]">
                                                            {fn.runtime.replace('_', ' ')}
                                                        </Badge>
                                                    </div>
                                                    <p className="text-xs text-text-muted mt-1 line-clamp-2">
                                                        {fn.description || 'No description'}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="mt-3 pt-3 border-t border-border-hairline flex items-center justify-between">
                                                <Badge variant="neutral" className="text-[9px] uppercase">
                                                    {fn.type}
                                                </Badge>
                                                <div className="flex items-center gap-1 text-xs text-text-muted">
                                                    {fn.enabled ? (
                                                        <>
                                                            <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-500" />
                                                            <span>Enabled</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <XCircleIcon className="w-3.5 h-3.5 text-rose-500" />
                                                            <span>Disabled</span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </Card>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Custom Functions */}
                        {customFunctions.length > 0 && (
                            <section className="animate-soft-in" style={{ animationDelay: '50ms' }}>
                                <div className="flex items-center gap-2 mb-4">
                                    <CpuChipIcon className="w-4 h-4 text-primary" />
                                    <h2 className="text-sm font-semibold text-text-main">Custom Functions</h2>
                                    <Badge variant="neutral" className="text-[9px]">
                                        {customFunctions.length}
                                    </Badge>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {customFunctions.map((fn, idx) => (
                                        <Card
                                            key={fn.id}
                                            className="animate-soft-in group"
                                            style={{ animationDelay: `${idx * 30}ms` }}
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className="icon-chip icon-chip--sky shrink-0">
                                                    {runtimeIcon(fn.runtime)}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <h3 className="text-sm font-semibold text-text-main truncate">
                                                            {fn.display_name || fn.name}
                                                        </h3>
                                                        <Badge variant={runtimeBadge(fn.runtime)} className="text-[9px]">
                                                            {fn.runtime.replace('_', ' ')}
                                                        </Badge>
                                                    </div>
                                                    <p className="text-xs text-text-muted mt-1 line-clamp-2">
                                                        {fn.description || 'No description'}
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={() => handleDeleteFunction(fn.id)}
                                                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded hover:bg-rose-500/10 text-rose-500"
                                                    title="Delete"
                                                >
                                                    <TrashIcon className="w-4 h-4" />
                                                </button>
                                            </div>
                                            <div className="mt-3 pt-3 border-t border-border-hairline flex items-center justify-between">
                                                <Badge variant="neutral" className="text-[9px] uppercase">
                                                    {fn.type}
                                                </Badge>
                                                <div className="flex items-center gap-1 text-xs text-text-muted">
                                                    {fn.enabled ? (
                                                        <>
                                                            <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-500" />
                                                            <span>Enabled</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <XCircleIcon className="w-3.5 h-3.5 text-rose-500" />
                                                            <span>Disabled</span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </Card>
                                    ))}
                                </div>
                            </section>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default FunctionsList;
