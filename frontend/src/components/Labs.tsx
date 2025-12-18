import React, { useState, useRef, useEffect } from 'react';
import {
    BeakerIcon,
    BoltIcon,
    CpuChipIcon,
    ServerStackIcon,
    SparklesIcon,
    CommandLineIcon,
    PaperAirplaneIcon,
    ArrowPathIcon,
    ChevronDownIcon
} from '@heroicons/react/24/outline';

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

const Labs: React.FC = () => {
    const [availableModels, setAvailableModels] = useState<ModelOption[]>(DEFAULT_MODELS);
    const [provider, setProvider] = useState<string>('openai');
    const [model, setModel] = useState('gpt-4o');

    const [systemPrompt, setSystemPrompt] = useState('You are a helpful AI assistant.');
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(false);

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
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: model,
                    provider: provider || undefined,
                    messages: requestMessages,
                    stream: true
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

    return (
        <div className="flex h-full bg-app transition-colors duration-300">
            <div className="w-1/3 border-r border-border-base flex flex-col bg-panel transition-colors duration-300">
                <div className="p-6 border-b border-border-base bg-app transition-colors duration-300">
                    <h2 className="text-xl font-serif font-black text-text-main leading-tight mb-1">Playground</h2>
                    <p className="text-xs text-text-muted font-medium opacity-70">Experiment with different models and prompts.</p>
                </div>

                <div className="p-4 flex-1 overflow-y-auto space-y-6">
                    <div>
                        <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Provider</label>
                        <div className="grid grid-cols-3 gap-2">
                            {PROVIDERS.map(p => (
                                <button
                                    key={p.id}
                                    onClick={() => { setProvider(p.id); }}
                                    className={`px-3 py-2.5 rounded-xl text-[10px] uppercase font-bold tracking-widest border transition-all ${provider === p.id
                                        ? 'bg-wispr-purple text-white border-wispr-purple shadow-lg shadow-wispr-purple/20'
                                        : 'bg-app text-text-muted border-border-base hover:border-wispr-purple-light hover:text-text-main'
                                        }`}
                                >
                                    {p.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Model</label>
                        <div className="relative">
                            <select
                                value={model}
                                onChange={(e) => setModel(e.target.value)}
                                className="w-full appearance-none bg-app border border-border-base text-text-main text-sm font-semibold rounded-xl px-4 py-2.5 pr-10 focus:outline-none focus:ring-2 focus:ring-wispr-purple/20 focus:border-wispr-purple transition-all cursor-pointer shadow-sm"
                            >
                                {displayedModels.map(m => (
                                    <option key={m.id} value={m.id}>{m.name}</option>
                                ))}
                            </select>
                            <ChevronDownIcon className="absolute right-3 top-2.5 w-4 h-4 text-text-muted pointer-events-none" />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">System Prompt</label>
                        <textarea
                            value={systemPrompt}
                            onChange={(e) => setSystemPrompt(e.target.value)}
                            className="w-full h-32 bg-app border border-border-base text-text-main text-sm rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-wispr-purple/20 focus:border-wispr-purple transition-all resize-none placeholder-text-muted/40 shadow-sm leading-relaxed"
                            placeholder="You are a helpful assistant..."
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Parameters</label>
                        <div className="bg-app border border-border-base rounded-2xl p-4 space-y-4 shadow-sm">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest opacity-70">Temperature</span>
                                <span className="text-xs font-mono font-bold text-text-main bg-panel px-2 py-0.5 rounded-lg border border-border-base">0.7</span>
                            </div>
                            <div className="w-full bg-border-base/50 h-1.5 rounded-full overflow-hidden">
                                <div className="bg-wispr-purple h-full w-[70%] shadow-[0_0_8px_rgba(141,124,228,0.4)]"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-1 flex flex-col bg-app transition-colors duration-300">
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
                            <div className={`max-w-[80%] rounded-3xl px-6 py-4 shadow-sm ${msg.role === 'user'
                                ? 'bg-wispr-purple text-white shadow-xl shadow-wispr-purple/20'
                                : 'bg-panel border border-border-base text-text-main'
                                }`}>
                                <div className={`text-[9px] mb-1 uppercase tracking-widest font-black opacity-60 ${msg.role === 'user' ? 'text-white/80' : 'text-text-muted'}`}>
                                    {msg.role}
                                    {msg.role === 'assistant' && msg.reasoning && (
                                        <span className="ml-2 text-[8px] bg-wispr-purple/20 text-wispr-purple dark:text-wispr-purple-light px-2 py-0.5 rounded-full border border-wispr-purple/10">reasoning</span>
                                    )}
                                </div>
                                <div className="text-sm whitespace-pre-wrap leading-relaxed font-medium">{msg.content || (msg.reasoning ? <span className="italic opacity-50">Thinking...</span> : '')}</div>

                                {msg.reasoning && (
                                    <div className="mt-3 pt-3 border-t border-dashed border-gray-400/30 text-xs">
                                        <div className="font-bold uppercase tracking-widest text-[9px] mb-2 opacity-60">Reasoning Process</div>
                                        <div className="font-mono text-[11px] opacity-90 whitespace-pre-wrap bg-black/5 dark:bg-white/5 p-4 rounded-xl leading-relaxed border border-border-base/50">{msg.reasoning}</div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="p-4 bg-panel border-t border-border-base transition-colors duration-300">
                    <div className="relative">
                        <textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSubmit();
                                }
                            }}
                            placeholder="Type a message..."
                            className="w-full bg-app border border-border-base text-text-main text-sm font-medium rounded-2xl pl-5 pr-14 py-4 focus:outline-none focus:ring-4 focus:ring-wispr-purple/10 focus:border-wispr-purple transition-all shadow-lg shadow-black/5 resize-none h-[64px] max-h-48 placeholder-text-muted/40 leading-relaxed"
                        />
                        <button
                            onClick={handleSubmit}
                            disabled={loading || !input.trim()}
                            className="absolute right-3 top-3 p-2.5 bg-wispr-purple text-white rounded-xl hover:bg-wispr-purple-dark disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-xl shadow-wispr-purple/20"
                        >
                            {loading ? (
                                <ArrowPathIcon className="w-5 h-5 animate-spin" />
                            ) : (
                                <PaperAirplaneIcon className="w-5 h-5" />
                            )}
                        </button>
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
