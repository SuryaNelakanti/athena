import React, { useState, useRef, useEffect } from 'react';
import {
    BeakerIcon,
    PaperAirplaneIcon,
    ArrowPathIcon,
    ChevronDownIcon,
    ChevronUpIcon
} from '@heroicons/react/24/outline';
import { Badge, Button, Card, IconButton, Select, Textarea, Input, cx } from '../ui';
import { PageHeader } from '../layout/PageHeader';
import { api } from '../../services/api';
import { Dataset, ModelRegistry, Playground } from '../../types';

// Simple types for the playground
interface Message {
    role: 'system' | 'user' | 'assistant';
    content: string;
    reasoning?: string;
}

interface ModelOption {
    id: string;
    name: string;
    provider: string;
}

type SnapshotStatus = {
    kind: 'error' | 'success' | 'info';
    message: string;
};

const DEFAULT_MODELS: ModelOption[] = [
    // OpenAI Upcoming/Hypothetical
    { id: 'gpt-5', name: 'GPT-5 (Preview)', provider: 'openai' },
    { id: 'gpt-5-pro', name: 'GPT-5 Pro', provider: 'openai' },
    { id: 'gpt-5-mini', name: 'GPT-5 Mini', provider: 'openai' },
    { id: 'gpt-5.2-pro', name: 'GPT-5.2 Pro', provider: 'openai' },
    { id: 'gpt-5.1-codex', name: 'GPT-5.1 Codex', provider: 'openai' },
    { id: 'gpt-4.1', name: 'GPT-4.1', provider: 'openai' },
    { id: 'o4-mini', name: 'o4 Mini', provider: 'openai' },
    { id: 'o3-mini', name: 'o3 Mini', provider: 'openai' },
    { id: 'o1-preview', name: 'o1 Preview', provider: 'openai' },

    // OpenAI Stable
    { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'openai' },
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'openai' },

    // Anthropic
    { id: 'claude-sonnet-4-5-20250929', name: 'Claude 4.5 Sonnet', provider: 'anthropic' },
    { id: 'claude-opus-4-5-20251101', name: 'Claude 4.5 Opus', provider: 'anthropic' },
    { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet', provider: 'anthropic' },
    { id: 'claude-3-5-sonnet-20240620', name: 'Claude 3.5 Sonnet', provider: 'anthropic' },
    { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', provider: 'anthropic' },
    { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet', provider: 'anthropic' },
    { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', provider: 'anthropic' },

    // Gemini
    { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro Preview', provider: 'gemini' },
    { id: 'gemini-3-pro-image-preview', name: 'Gemini 3 Pro Image', provider: 'gemini' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'gemini' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'gemini' },
    { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', provider: 'gemini' },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'gemini' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'gemini' },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', provider: 'gemini' },

    // Mock
    { id: 'mock-model', name: 'Mock Model (Test)', provider: 'mock' },
];

const PROVIDERS = [
    { id: 'openai', name: 'OpenAI' },
    { id: 'anthropic', name: 'Anthropic' },
    { id: 'gemini', name: 'Gemini' },
    { id: 'mock', name: 'Mock' },
];

const DEFAULT_SYSTEM_PROMPT = 'You are a helpful AI assistant.';
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_TOP_P = 1.0;
const NEW_PLAYGROUND_VALUE = '__new__';

interface LabsProps {
    projectId: string;
}

const Labs: React.FC<LabsProps> = ({ projectId }) => {
    const [availableModels, setAvailableModels] = useState<ModelOption[]>(DEFAULT_MODELS);
    const [provider, setProvider] = useState<string>('openai');
    const [model, setModel] = useState('gpt-4o');

    const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(false);

    // Model parameters
    const [temperature, setTemperature] = useState(DEFAULT_TEMPERATURE);
    const [maxTokens, setMaxTokens] = useState<number | undefined>(undefined);
    const [topP, setTopP] = useState(DEFAULT_TOP_P);
    const [showAdvanced, setShowAdvanced] = useState(false);

    // Playground persistence
    const [playgrounds, setPlaygrounds] = useState<Playground[]>([]);
    const [activePlaygroundId, setActivePlaygroundId] = useState<string | null>(null);
    const [selectedPlaygroundId, setSelectedPlaygroundId] = useState<string>(NEW_PLAYGROUND_VALUE);
    const [playgroundName, setPlaygroundName] = useState('Untitled Playground');
    const [playgroundStatus, setPlaygroundStatus] = useState<string | null>(null);
    const [loadingPlaygrounds, setLoadingPlaygrounds] = useState(false);
    const [savingPlayground, setSavingPlayground] = useState(false);

    // Snapshot to experiment
    const [datasets, setDatasets] = useState<Dataset[]>([]);
    const [modelRegistry, setModelRegistry] = useState<ModelRegistry[]>([]);
    const [snapshotDatasetId, setSnapshotDatasetId] = useState('');
    const [snapshotExperimentName, setSnapshotExperimentName] = useState('');
    const [snapshotNameTouched, setSnapshotNameTouched] = useState(false);
    const [snapshotStatus, setSnapshotStatus] = useState<SnapshotStatus | null>(null);
    const [snapshotLoading, setSnapshotLoading] = useState(false);
    const [snapshotExperimentId, setSnapshotExperimentId] = useState<string | null>(null);
    const [loadingSnapshotRefs, setLoadingSnapshotRefs] = useState(false);

    // Ref for scrolling
    const messagesEndRef = useRef<HTMLDivElement>(null);
    // Ref for abort controller
    const abortControllerRef = useRef<AbortController | null>(null);

    // Auto-select model when provider changes
    useEffect(() => {
        const modelsForProvider = availableModels.filter(m => m.provider === provider);
        if (modelsForProvider.length > 0) {
            const currentValid = modelsForProvider.find(m => m.id === model);
            if (!currentValid) {
                setModel(modelsForProvider[0].id);
            }
        }
    }, [provider, availableModels]); // model removed from deps

    // Scroll to bottom
    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    // Fetch models on mount
    useEffect(() => {
        const fetchModels = async () => {
            try {
                const res = await fetch('http://localhost:8000/v1/models');     
                if (res.ok) {
                    const json = await res.json();
                    if (json.data && Array.isArray(json.data)) {
                        const mapped: ModelOption[] = json.data.map((m: any) => ({
                            id: m.id,
                            name: m.id,
                            provider: m.owned_by
                        }));

                        const merged = [...DEFAULT_MODELS];
                        mapped.forEach(m => {
                            if (!merged.find(existing => existing.id === m.id)) {
                                merged.push(m);
                            }
                        });
                        setAvailableModels(merged);
                    }
                }
            } catch (e) {
                console.error("Failed to fetch models", e);
            }
        };
        fetchModels();
    }, []);

    useEffect(() => {
        if (!projectId) return;
        const loadPlaygrounds = async () => {
            setLoadingPlaygrounds(true);
            try {
                const data = await api.getPlaygrounds(projectId);
                setPlaygrounds(data);
            } catch (e) {
                console.error("Failed to load playgrounds", e);
            } finally {
                setLoadingPlaygrounds(false);
            }
        };
        loadPlaygrounds();
    }, [projectId]);

    useEffect(() => {
        if (!projectId) return;
        const loadSnapshotRefs = async () => {
            setLoadingSnapshotRefs(true);
            try {
                const [datasetsData, registryData] = await Promise.all([
                    api.getDatasets(projectId),
                    api.getModelRegistry(true),
                ]);
                setDatasets(datasetsData);
                setModelRegistry(registryData);
                setSnapshotDatasetId(prev => {
                    if (datasetsData.length === 1) {
                        return datasetsData[0].id;
                    }
                    if (prev && datasetsData.some(d => d.id === prev)) {
                        return prev;
                    }
                    return '';
                });
            } catch (e) {
                console.error("Failed to load snapshot references", e);
            } finally {
                setLoadingSnapshotRefs(false);
            }
        };
        loadSnapshotRefs();
    }, [projectId]);

    useEffect(() => {
        if (snapshotNameTouched) return;
        const trimmed = playgroundName.trim();
        setSnapshotExperimentName(trimmed || 'Playground Snapshot');
    }, [playgroundName, snapshotNameTouched]);

    useEffect(() => {
        setSelectedPlaygroundId(activePlaygroundId ?? NEW_PLAYGROUND_VALUE);
    }, [activePlaygroundId]);

    const buildConfig = () => ({
        provider,
        model,
        system_prompt: systemPrompt,
        temperature,
        max_tokens: maxTokens ?? null,
        top_p: topP,
        messages,
    });

    const applyConfig = (config: any) => {
        setProvider(config?.provider || 'openai');
        setModel(config?.model || 'gpt-4o');
        setSystemPrompt(config?.system_prompt || DEFAULT_SYSTEM_PROMPT);
        setTemperature(typeof config?.temperature === 'number' ? config.temperature : DEFAULT_TEMPERATURE);
        setMaxTokens(typeof config?.max_tokens === 'number' ? config.max_tokens : undefined);
        setTopP(typeof config?.top_p === 'number' ? config.top_p : DEFAULT_TOP_P);
        setMessages(Array.isArray(config?.messages) ? config.messages : []);
    };

    const resetPlayground = () => {
        setActivePlaygroundId(null);
        setSelectedPlaygroundId(NEW_PLAYGROUND_VALUE);
        setPlaygroundName('Untitled Playground');
        applyConfig({});
        setPlaygroundStatus(null);
        setSnapshotNameTouched(false);
        setSnapshotStatus(null);
        setSnapshotExperimentId(null);
    };

    const handleLoadPlayground = async (playgroundId: string) => {
        if (!playgroundId) return;
        setPlaygroundStatus(null);
        try {
            const existing = playgrounds.find(pg => pg.id === playgroundId);
            const playground = existing || await api.getPlayground(playgroundId);
            setActivePlaygroundId(playground.id);
            setSelectedPlaygroundId(playground.id);
            setPlaygroundName(playground.name);
            applyConfig(playground.config || {});
            setSnapshotNameTouched(false);
            setSnapshotStatus(null);
            setSnapshotExperimentId(null);
        } catch (e: any) {
            setPlaygroundStatus(e?.message || "Failed to load playground");
        }
    };

    const handleLoadSelectedPlayground = async () => {
        if (selectedPlaygroundId === NEW_PLAYGROUND_VALUE) {
            resetPlayground();
            return;
        }
        await handleLoadPlayground(selectedPlaygroundId);
    };

    const handleSavePlayground = async () => {
        if (!projectId) return;
        const name = playgroundName.trim();
        if (!name) {
            setPlaygroundStatus("Playground name is required");
            return;
        }
        setSavingPlayground(true);
        setPlaygroundStatus(null);
        const config = buildConfig();
        try {
            if (!activePlaygroundId) {
                const created = await api.createPlayground({
                    project_id: projectId,
                    name,
                    config,
                });
                setActivePlaygroundId(created.id);
                setSelectedPlaygroundId(created.id);
            } else {
                await api.updatePlayground(activePlaygroundId, { name, config });
            }
            const data = await api.getPlaygrounds(projectId);
            setPlaygrounds(data);
        } catch (e: any) {
            setPlaygroundStatus(e?.message || "Failed to save playground");
        } finally {
            setSavingPlayground(false);
        }
    };

    const handleDeletePlayground = async () => {
        if (!activePlaygroundId || !projectId) return;
        setSavingPlayground(true);
        setPlaygroundStatus(null);
        try {
            await api.deletePlayground(activePlaygroundId);
            const data = await api.getPlaygrounds(projectId);
            setPlaygrounds(data);
            resetPlayground();
        } catch (e: any) {
            setPlaygroundStatus(e?.message || "Failed to delete playground");
        } finally {
            setSavingPlayground(false);
        }
    };

    const handleSnapshotToExperiment = async () => {
        if (!projectId) return;
        const name = snapshotExperimentName.trim() || playgroundName.trim() || 'Playground Snapshot';
        if (!snapshotDatasetId) {
            setSnapshotStatus({ kind: 'error', message: 'Select a dataset to snapshot.' });
            return;
        }
        const modelRegistryId = modelRegistry.find(
            entry => entry.provider === provider && entry.model_id === model
        )?.id;
        if (!modelRegistryId) {
            setSnapshotStatus({ kind: 'error', message: 'Model is not in the registry. Enable it in Settings.' });
            return;
        }

        setSnapshotLoading(true);
        setSnapshotStatus(null);
        setSnapshotExperimentId(null);
        try {
            const experiment = await api.createExperiment({
                project_id: projectId,
                dataset_id: snapshotDatasetId,
                name,
                summary: {
                    source: 'playground',
                    playground_id: activePlaygroundId,
                    playground_name: playgroundName,
                },
            });
            await api.createExperimentVersion(experiment.id, {
                model_registry_id: modelRegistryId,
                temperature,
                max_tokens: maxTokens ?? undefined,
                top_p: topP,
                system_prompt: systemPrompt,
                scorers: ['exact_match'],
                notes: activePlaygroundId
                    ? `Snapshot from playground ${playgroundName} (${activePlaygroundId})`
                    : `Snapshot from playground ${playgroundName}`,
            });
            setSnapshotExperimentId(experiment.id);
            setSnapshotStatus({ kind: 'success', message: `Created experiment "${experiment.name}".` });
        } catch (e: any) {
            setSnapshotStatus({ kind: 'error', message: e?.message || 'Failed to snapshot to experiment.' });
        } finally {
            setSnapshotLoading(false);
        }
    };

    const handleOpenSnapshotExperiment = () => {
        if (!snapshotExperimentId) return;
        window.location.hash = `#/experiments?experiment_id=${encodeURIComponent(snapshotExperimentId)}`;
    };

    const handleSubmit = async () => {
        if (!input.trim()) return;

        setLoading(true);
        const userMsg: Message = { role: 'user', content: input };
        setMessages(prev => [...prev, userMsg]);
        setInput(''); // clear input immediately

        // Create a placeholder for assistant response
        setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

        abortControllerRef.current = new AbortController();

        const requestMessages = [
            { role: 'system', content: systemPrompt },
            ...messages.map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: userMsg.content }
        ];

        try {
            const res = await fetch('http://localhost:8000/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(projectId ? { 'X-Athena-Project-ID': projectId } : {}),
                },
                body: JSON.stringify({
                    model: model,
                    provider: provider || undefined,
                    messages: requestMessages,
                    stream: true,
                    temperature: temperature,
                    max_tokens: maxTokens || undefined,
                    top_p: topP !== 1.0 ? topP : undefined,
                    project_id: projectId || undefined,
                }),
                signal: abortControllerRef.current.signal
            });

            if (!res.ok) {
                const err = await res.text();
                // Update last message with error
                setMessages(prev => {
                    const newParam = [...prev];
                    newParam[newParam.length - 1].content = `Error: ${res.status} ${err}`;
                    return newParam;
                });
                setLoading(false);
                return;
            }

            if (!res.body) return;
            const reader = res.body.getReader();
            const decoder = new TextDecoder("utf-8");

            let done = false;
            let currentContent = "";
            let currentReasoning = "";

            while (!done) {
                const { value, done: doneReading } = await reader.read();
                done = doneReading;
                const chunkValue = decoder.decode(value, { stream: true });

                const lines = chunkValue.split('\n');
                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        const data = line.slice(6);
                        if (data === "[DONE]") {
                            done = true;
                            break;
                        }
                        try {
                            const json = JSON.parse(data);
                            if (json.choices && json.choices.length > 0) {
                                const delta = json.choices[0].delta;
                                if (delta.content) {
                                    currentContent += delta.content;
                                }
                                if (delta.reasoning_content) { // Assuming reasoning_content field
                                    currentReasoning += delta.reasoning_content;
                                }

                                // Update the assistant message in place
                                setMessages(prev => {
                                    const newMsg = [...prev];
                                    const lastMsg = newMsg[newMsg.length - 1];
                                    lastMsg.content = currentContent;
                                    if (currentReasoning) {
                                        lastMsg.reasoning = currentReasoning;
                                    }
                                    return newMsg;
                                });
                            }
                        } catch (e) {
                            console.error("Error parsing JSON chunk", e);
                        }
                    }
                }
            }

        } catch (err: any) {
            if (err.name === 'AbortError') {
                setMessages(prev => {
                    const newMsg = [...prev];
                    newMsg[newMsg.length - 1].content += "\n[Aborted]";
                    return newMsg;
                });
            } else {
                setMessages(prev => {
                    const newMsg = [...prev];
                    newMsg[newMsg.length - 1].content = `Error: ${err.message}`;
                    return newMsg;
                });
            }
        } finally {
            setLoading(false);
            abortControllerRef.current = null;
        }
    };

    // Filtered models for UI
    const displayedModels = availableModels.filter(m => m.provider === provider);
    const matchedRegistry = modelRegistry.find(
        entry => entry.provider === provider && entry.model_id === model
    );
    const snapshotDisabled = snapshotLoading || !snapshotDatasetId || !matchedRegistry;
    const snapshotStatusClass = snapshotStatus?.kind === 'error'
        ? 'text-rose-500'
        : snapshotStatus?.kind === 'success'
            ? 'text-emerald-500'
            : 'text-text-muted';

    return (
        <div className="flex h-full">
            <div className="w-1/3 border-r border-border-hairline flex flex-col">
                <PageHeader
                    title="Playground"
                    subtitle="Experiment with different models and prompts."
                    className="p-6"
                />

                <div className="p-4 flex-1 overflow-y-auto space-y-6">
                    <div>
                        <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Playground</label>
                        <Card padded={false} className="bg-app p-4 space-y-3">
                            <div>
                                <label className="block text-[10px] font-bold text-text-muted uppercase tracking-widest mb-2">Name</label>
                                <Input
                                    value={playgroundName}
                                    onChange={(e) => setPlaygroundName(e.target.value)}
                                    placeholder="Untitled Playground"
                                />
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold text-text-muted uppercase tracking-widest mb-2">Load</label>
                                <div className="relative">
                                    <Select
                                        value={selectedPlaygroundId}
                                        onChange={(e) => setSelectedPlaygroundId(e.target.value)}
                                        className="pr-9"
                                    >
                                        <option value={NEW_PLAYGROUND_VALUE}>New playground</option>
                                        {playgrounds.map(pg => (
                                            <option key={pg.id} value={pg.id}>{pg.name}</option>
                                        ))}
                                    </Select>
                                    <ChevronDownIcon className="absolute right-3 top-2.5 w-4 h-4 text-text-muted pointer-events-none" />
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={handleSavePlayground}
                                    disabled={savingPlayground || !playgroundName.trim()}
                                >
                                    {savingPlayground ? 'Saving...' : 'Save'}
                                </Button>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={handleLoadSelectedPlayground}
                                    disabled={savingPlayground || loadingPlaygrounds}
                                >
                                    Load
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleDeletePlayground}
                                    disabled={!activePlaygroundId || savingPlayground}
                                >
                                    Delete
                                </Button>
                            </div>

                            {playgroundStatus && (
                                <p className="text-[11px] text-rose-500 font-medium">{playgroundStatus}</p>
                            )}
                        </Card>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Snapshot to Experiment</label>
                        <Card padded={false} className="bg-app p-4 space-y-3">
                            <p className="text-[11px] text-text-muted">
                                Create an experiment version from the current model and prompt settings.
                            </p>
                            <div>
                                <label className="block text-[10px] font-bold text-text-muted uppercase tracking-widest mb-2">Dataset</label>
                                <div className="relative">
                                    <Select
                                        value={snapshotDatasetId}
                                        onChange={(e) => setSnapshotDatasetId(e.target.value)}
                                        disabled={loadingSnapshotRefs || datasets.length === 0}
                                        className="pr-9"
                                    >
                                        <option value="">
                                            {loadingSnapshotRefs
                                                ? 'Loading datasets...'
                                                : datasets.length === 0
                                                    ? 'No datasets available'
                                                    : 'Select a dataset'}
                                        </option>
                                        {datasets.map(ds => (
                                            <option key={ds.id} value={ds.id}>{ds.name}</option>
                                        ))}
                                    </Select>
                                    <ChevronDownIcon className="absolute right-3 top-2.5 w-4 h-4 text-text-muted pointer-events-none" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-text-muted uppercase tracking-widest mb-2">Experiment Name</label>
                                <Input
                                    value={snapshotExperimentName}
                                    onChange={(e) => {
                                        setSnapshotExperimentName(e.target.value);
                                        setSnapshotNameTouched(true);
                                    }}
                                    placeholder="Experiment name"
                                />
                            </div>
                            {!loadingSnapshotRefs && !matchedRegistry && (
                                <p className="text-[11px] text-amber-500">
                                    Model not in registry. Enable it in Settings to snapshot.
                                </p>
                            )}
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={handleSnapshotToExperiment}
                                    disabled={snapshotDisabled}
                                >
                                    {snapshotLoading ? 'Snapshotting...' : 'Snapshot'}
                                </Button>
                                {snapshotExperimentId && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleOpenSnapshotExperiment}
                                    >
                                        Open
                                    </Button>
                                )}
                            </div>
                            {snapshotStatus && (
                                <p className={`text-[11px] font-medium ${snapshotStatusClass}`}>
                                    {snapshotStatus.message}
                                </p>
                            )}
                        </Card>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Provider</label>
                        <div className="grid grid-cols-3 gap-2">
                            {PROVIDERS.map(p => {
                                const isActive = provider === p.id;
                                return (
                                    <Button
                                        key={p.id}
                                        onClick={() => { setProvider(p.id); }}
                                        variant={isActive ? 'primary' : 'outline'}
                                        size="sm"
                                        className={cx(
                                            'text-[10px] uppercase tracking-widest font-semibold',
                                            !isActive && 'text-text-muted hover:text-text-main'
                                        )}
                                    >
                                        {p.name}
                                    </Button>
                                );
                            })}
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Model</label>
                        <div className="relative">
                            <Select
                                value={model}
                                onChange={(e) => setModel(e.target.value)}
                                className="pr-9 font-medium"
                            >
                                {displayedModels.map(m => (
                                    <option key={m.id} value={m.id}>{m.name}</option>
                                ))}
                            </Select>
                            <ChevronDownIcon className="absolute right-3 top-2.5 w-4 h-4 text-text-muted pointer-events-none" />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">System Prompt</label>
                        <Textarea
                            value={systemPrompt}
                            onChange={(e) => setSystemPrompt(e.target.value)}
                            className="h-32 resize-none leading-relaxed"
                            placeholder="You are a helpful assistant..."
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Parameters</label>
                        <Card padded={false} className="bg-app p-4 space-y-4">
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Temperature</span>
                                    <span className="text-xs font-bold text-text-main bg-panel px-2 py-0.5 rounded-lg border border-border-base tabular-nums">{temperature.toFixed(1)}</span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="2"
                                    step="0.1"
                                    value={temperature}
                                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                                    className="w-full h-1.5 bg-border-base/50 rounded-full appearance-none cursor-pointer accent-primary"
                                />
                                <div className="flex justify-between text-[9px] text-text-muted mt-1">
                                    <span>Precise</span>
                                    <span>Creative</span>
                                </div>
                            </div>

                            <button
                                onClick={() => setShowAdvanced(!showAdvanced)}
                                className="flex items-center gap-1.5 text-[10px] font-bold text-text-muted uppercase tracking-widest hover:text-text-main transition-colors"
                            >
                                {showAdvanced ? <ChevronUpIcon className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />}
                                Advanced Settings
                            </button>

                            {showAdvanced && (
                                <div className="space-y-4 pt-2 border-t border-border-base">
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Max Tokens</span>
                                            <span className="text-xs font-bold text-text-main bg-panel px-2 py-0.5 rounded-lg border border-border-base tabular-nums">
                                                {maxTokens || 'auto'}
                                            </span>
                                        </div>
                                        <input
                                            type="number"
                                            min="1"
                                            max="128000"
                                            value={maxTokens || ''}
                                            onChange={(e) => setMaxTokens(e.target.value ? parseInt(e.target.value) : undefined)}
                                            placeholder="Leave empty for auto"
                                            className="w-full px-3 py-1.5 text-xs bg-panel border border-border-base rounded-md text-text-main placeholder:text-text-muted"
                                        />
                                    </div>

                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Top P</span>
                                            <span className="text-xs font-bold text-text-main bg-panel px-2 py-0.5 rounded-lg border border-border-base tabular-nums">{topP.toFixed(2)}</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="0"
                                            max="1"
                                            step="0.05"
                                            value={topP}
                                            onChange={(e) => setTopP(parseFloat(e.target.value))}
                                            className="w-full h-1.5 bg-border-base/50 rounded-full appearance-none cursor-pointer accent-primary"
                                        />
                                    </div>
                                </div>
                            )}
                        </Card>
                    </div>
                </div>
            </div>

            <div className="flex-1 flex flex-col">
                {/* Chat Area */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {messages.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center opacity-30">
                            <BeakerIcon className="w-16 h-16 text-text-muted mb-4" />
                            <p className="text-text-muted text-sm font-medium">Ready to experiment</p>
                        </div>
                    )}

                    {messages.map((msg, idx) => (
                        <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[80%] rounded-xl px-6 py-4 shadow-xs ${msg.role === 'user'
                                ? 'bg-primary text-white border border-primary'
                                : 'bg-panel border border-border-base text-text-main'
                                }`}>
                                <div className={`text-[9px] mb-1 uppercase tracking-widest font-black opacity-60 ${msg.role === 'user' ? 'text-white/80' : 'text-text-muted'}`}>
                                    {msg.role}
                                    {msg.role === 'assistant' && msg.reasoning && (
                                        <Badge variant="primary" className="ml-2">reasoning</Badge>
                                    )}
                                </div>
                                <div className="text-sm whitespace-pre-wrap leading-relaxed font-medium">{msg.content || (msg.reasoning ? <span className="italic opacity-50">Thinking...</span> : '')}</div>

                                {msg.reasoning && (
                                    <div className="mt-3 pt-3 border-t border-dashed border-border-base/60 text-xs">
                                        <div className="font-bold uppercase tracking-widest text-[9px] mb-2 opacity-60">Reasoning Process</div>
                                        <div className="text-[11px] opacity-90 whitespace-pre-wrap bg-app p-4 rounded-lg leading-relaxed border border-border-base/70">{msg.reasoning}</div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="p-4 border-t border-border-hairline">
                    <div className="relative">
                        <Textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSubmit();
                                }
                            }}
                            placeholder="Type a message..."
                            className="h-[64px] max-h-48 resize-none bg-app px-4 py-3 pr-14 text-sm font-medium leading-relaxed shadow-sm"
                        />
                        <IconButton
                            onClick={handleSubmit}
                            disabled={loading || !input.trim()}
                            variant="primary"
                            size="sm"
                            className="absolute right-3 top-3 shadow-xs"
                        >
                            {loading ? (
                                <ArrowPathIcon className="w-5 h-5 animate-spin" />
                            ) : (
                                <PaperAirplaneIcon className="w-5 h-5" />
                            )}
                        </IconButton>
                    </div>
                    <div className="text-center mt-2">
                        <span className="text-[10px] text-text-muted">Enter to send, Shift + Enter for new line</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Labs;
