import React, { useState, useRef, useEffect } from 'react';
import {
    BeakerIcon,
    BoltIcon,
    CpuChipIcon,
    ServerStackIcon,
    SparklesIcon,
    CommandLineIcon
} from '@heroicons/react/24/outline';

// Simple types for the playground
interface Message {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

interface ModelOption {
    id: string;
    name: string;
    provider: string;
}

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

const Labs: React.FC = () => {
    const [availableModels, setAvailableModels] = useState<ModelOption[]>(DEFAULT_MODELS);
    const [provider, setProvider] = useState<string>('openai');
    const [model, setModel] = useState('');

    // Auto-select model when provider changes
    useEffect(() => {
        const modelsForProvider = availableModels.filter(m => m.provider === provider);
        if (modelsForProvider.length > 0) {
            // Try to preserve selection if valid, else pick first
            const currentValid = modelsForProvider.find(m => m.id === model);
            if (!currentValid) {
                setModel(modelsForProvider[0].id);
            }
        } else {
            // Fallback to custom entry if no models found (unlikely)
            // setModel('');
        }
    }, [provider, availableModels]); // removed 'model' from deps to avoid loop

    const [systemPrompt, setSystemPrompt] = useState('You are a helpful AI assistant.');
    const [userPrompt, setUserPrompt] = useState('');
    const [responseContent, setResponseContent] = useState('');
    const [loading, setLoading] = useState(false);

    // Ref for abort controller if we want to add stop button
    const abortControllerRef = useRef<AbortController | null>(null);

    // Fetch models on mount
    useEffect(() => {
        const fetchModels = async () => {
            // ... existing fetch logic, merging with DEFAULT_MODELS ...
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
                        // We prioritize our rich static list for names, but append any new ones from backend?
                        // Actually backend just returns IDs for now. 
                        // Let's just append any that aren't in DEFAULT_MODELS

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

    const handleProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setProvider(e.target.value);
    };

    const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setModel(e.target.value);
    };

    // Filtered models for UI
    const displayedModels = availableModels.filter(m => m.provider === provider);

    // ... handleSubmit ...


    const handleSubmit = async () => {
        // ... (existing logic)
        if (!userPrompt.trim()) return;

        setLoading(true);
        setResponseContent('');

        abortControllerRef.current = new AbortController();

        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ];

        try {
            const res = await fetch('http://localhost:8000/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: model,
                    provider: provider || undefined,
                    messages: messages,
                    stream: true
                }),
                signal: abortControllerRef.current.signal
            });

            // ... (rest of logic handles stream)
            if (!res.ok) {
                const err = await res.text();
                setResponseContent(`Error: ${res.status} ${err}`);
                setLoading(false);
                return;
            }

            if (!res.body) return;
            const reader = res.body.getReader();
            const decoder = new TextDecoder("utf-8");

            let done = false;

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
                                const delta = json.choices[0].delta.content || "";
                                setResponseContent(prev => prev + delta);
                            }
                        } catch (e) {
                            console.error("Error parsing JSON chunk", e);
                        }
                    }
                }
            }

        } catch (err: any) {
            if (err.name === 'AbortError') {
                setResponseContent(prev => prev + "\n[Aborted]");
            } else {
                setResponseContent(`Error: ${err.message}`);
            }
        } finally {
            setLoading(false);
            abortControllerRef.current = null;
        }
    };

    return (
        <div className="p-6 h-full flex flex-col bg-gray-950 text-white overflow-hidden font-sans">
            <div className="flex items-center gap-3 mb-6">
                <BeakerIcon className="w-8 h-8 text-blue-500" />
                <h1 className="text-3xl font-bold font-serif tracking-tight">Athena Labs <span className="text-sm font-light text-gray-500 font-mono opacity-80 ml-2">v0.1.0</span></h1>
            </div>

            <div className="flex gap-6 h-full">
                {/* Left Control Panel */}
                <div className="w-1/3 flex flex-col gap-6 border-r border-gray-800 pr-6">

                    {/* Provider Selector */}
                    <div className="flex flex-col gap-2">
                        <label className="text-xs uppercase tracking-wider font-semibold text-gray-500 flex items-center gap-2">
                            <ServerStackIcon className="w-4 h-4" /> Provider
                        </label>
                        <div className="relative">
                            <select
                                value={provider}
                                onChange={handleProviderChange}
                                className="w-full bg-gray-900 border border-gray-700 rounded-md p-3 pl-3 pr-10 hover:border-purple-500 focus:border-purple-500 outline-none appearance-none transition-colors"
                            >
                                <option value="openai">OpenAI</option>
                                <option value="anthropic">Anthropic</option>
                                <option value="gemini">Gemini</option>
                                <option value="mock">Mock (Test)</option>
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
                                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" /></svg>
                            </div>
                        </div>
                    </div>

                    {/* Model Selector */}
                    <div className="flex flex-col gap-2">
                        <label className="text-xs uppercase tracking-wider font-semibold text-gray-500 flex items-center gap-2">
                            <CpuChipIcon className="w-4 h-4" /> Model
                        </label>
                        <div className="relative">
                            <select
                                value={model}
                                onChange={handleModelChange}
                                className="w-full bg-gray-900 border border-gray-700 rounded-md p-3 pl-3 pr-10 hover:border-blue-500 focus:border-blue-500 outline-none appearance-none transition-colors"
                            >
                                {displayedModels.map(m => (
                                    <option key={m.id} value={m.id}>{m.name}</option>
                                ))}
                                <option value="custom">Custom...</option>
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
                                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" /></svg>
                            </div>
                        </div>
                        {model === 'custom' && (
                            <input
                                type="text"
                                placeholder="Enter custom model ID"
                                className="mt-2 bg-gray-900 border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none block w-full"
                                onChange={(e) => setModel(e.target.value)}
                            />
                        )}
                    </div>

                    {/* System Prompt */}
                    <div className="flex flex-col gap-2 flex-grow">
                        <label className="text-xs uppercase tracking-wider font-semibold text-gray-500 flex items-center gap-2">
                            <CommandLineIcon className="w-4 h-4" /> System Prompt
                        </label>
                        <textarea
                            value={systemPrompt}
                            onChange={e => setSystemPrompt(e.target.value)}
                            className="bg-gray-900 border border-gray-700 rounded-md p-3 text-white h-full resize-none focus:border-blue-500 outline-none font-mono text-sm leading-relaxed"
                        />
                    </div>
                </div>


                {/* Right Interaction Panel */}
                <div className="w-2/3 flex flex-col gap-4">
                    <div className="flex flex-col gap-2 h-1/2">
                        <label className="text-xs uppercase tracking-wider font-semibold text-gray-500 flex items-center gap-2">
                            <SparklesIcon className="w-4 h-4" /> User Prompt
                        </label>
                        <textarea
                            value={userPrompt}
                            onChange={e => setUserPrompt(e.target.value)}
                            className="bg-gray-900 border border-gray-700 rounded-md p-3 text-white h-full resize-none focus:border-blue-500 outline-none font-mono text-sm leading-relaxed placeholder-gray-600"
                            placeholder="Enter your prompt here..."
                        />
                        <button
                            onClick={handleSubmit}
                            disabled={loading}
                            className={`p-3 rounded-md font-bold flex items-center justify-center gap-2 transition-all ${loading ? 'bg-gray-800 text-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20'}`}
                        >
                            {loading ? (
                                <>
                                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                                    Streaming Response...
                                </>
                            ) : (
                                <>
                                    <BoltIcon className="w-5 h-5" /> Run Request
                                </>
                            )}
                        </button>
                    </div>

                    <div className="flex flex-col gap-2 h-1/2">
                        <label className="text-xs uppercase tracking-wider font-semibold text-gray-500 flex items-center gap-2">
                            <BeakerIcon className="w-4 h-4" /> Response Output
                        </label>
                        <div className="bg-black border border-gray-800 rounded-md p-4 h-full overflow-auto font-mono text-sm text-green-400 whitespace-pre-wrap leading-relaxed shadow-inner">
                            {responseContent || <span className="text-gray-700 italic">Response will appear here...</span>}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Labs;
