import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import { ModelRegistry } from '../types';
import { ArrowPathIcon, KeyIcon, TrashIcon } from '@heroicons/react/24/outline';

type ProviderId = 'openai' | 'anthropic' | 'gemini' | 'mock';

type ProviderStatus = {
    provider: ProviderId;
    configured: boolean;
    updated_at_ms: number | null;
};

const Settings: React.FC = () => {
    const [providers, setProviders] = useState<ProviderStatus[]>([]);
    const [models, setModels] = useState<ModelRegistry[]>([]);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
    const [busyProvider, setBusyProvider] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const [ps, ms] = await Promise.all([api.getProviderStatuses(), api.getModelRegistry(false)]);
            setProviders(ps);
            setModels(ms);
        } catch (e: any) {
            setError(e?.message || 'Failed to load settings');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    const sync = async (provider?: ProviderId) => {
        setError(null);
        setBusyProvider(provider || 'all');
        try {
            await api.syncModelRegistry(provider ? { provider } : {});
            await load();
        } catch (e: any) {
            setError(e?.message || 'Failed to sync models');
        } finally {
            setBusyProvider(null);
        }
    };

    const setKey = async (provider: ProviderId) => {
        setError(null);
        setBusyProvider(provider);
        try {
            await api.setProviderApiKey(provider, (apiKeys[provider] || '').trim());
            setApiKeys((prev) => ({ ...prev, [provider]: '' }));
            await load();
        } catch (e: any) {
            setError(e?.message || 'Failed to set api key');
        } finally {
            setBusyProvider(null);
        }
    };

    const clearKey = async (provider: ProviderId) => {
        setError(null);
        setBusyProvider(provider);
        try {
            await api.clearProviderApiKey(provider);
            await load();
        } catch (e: any) {
            setError(e?.message || 'Failed to clear api key');
        } finally {
            setBusyProvider(null);
        }
    };

    const toggleModel = async (id: string, enabled: boolean) => {
        setError(null);
        try {
            const updated = await api.updateModelRegistryEntry(id, { enabled });
            setModels((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
        } catch (e: any) {
            setError(e?.message || 'Failed to update model');
        }
    };

    const grouped = useMemo(() => {
        const groups: Record<string, ModelRegistry[]> = {};
        for (const m of models) {
            groups[m.provider] = groups[m.provider] || [];
            groups[m.provider].push(m);
        }
        Object.values(groups).forEach((arr) => arr.sort((a, b) => Number(b.enabled) - Number(a.enabled)));
        return groups;
    }, [models]);

    return (
        <div className="p-8 h-full overflow-y-auto bg-app transition-colors duration-300">
            <div className="mb-8">
                <h1 className="text-3xl font-serif font-black text-text-main tracking-tight">Settings</h1>
                <p className="text-text-muted text-sm mt-1">Local provider keys (in-memory) and the curated model registry.</p>
            </div>

            {error && (
                <div className="mb-6 bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 rounded-2xl p-4 text-sm font-semibold">
                    {error}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
                <div className="bg-panel border border-border-base rounded-3xl p-6">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h2 className="text-lg font-bold text-text-main">Provider Keys</h2>
                            <p className="text-xs text-text-muted mt-1">Keys are stored only in memory and are lost on restart.</p>
                        </div>
                        <button
                            onClick={() => sync()}
                            disabled={busyProvider !== null}
                            className="flex items-center gap-2 px-3 py-2 bg-wispr-purple text-white rounded-xl text-xs font-bold shadow-lg shadow-wispr-purple/20 hover:bg-wispr-purple-dark disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                            <ArrowPathIcon className={`w-4 h-4 ${busyProvider ? 'animate-spin' : ''}`} />
                            SYNC ALL MODELS
                        </button>
                    </div>

                    {loading ? (
                        <div className="py-10 text-center text-text-muted italic">Loading providers...</div>
                    ) : (
                        <div className="space-y-4">
                            {providers.map((p) => (
                                <div key={p.provider} className="bg-app border border-border-base rounded-2xl p-5">
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <div className="text-xs font-bold uppercase tracking-widest opacity-70">{p.provider}</div>
                                            <div className="mt-1 text-sm font-semibold text-text-main">
                                                {p.configured ? 'Configured' : 'Not configured'}
                                            </div>
                                            <div className="text-xs text-text-muted mt-1">
                                                Updated: {p.updated_at_ms ? new Date(p.updated_at_ms).toLocaleString() : '-'}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => sync(p.provider)}
                                            disabled={busyProvider !== null}
                                            className="px-3 py-2 bg-panel border border-border-base rounded-xl text-xs font-bold text-text-muted hover:text-text-main hover:border-border-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                        >
                                            SYNC
                                        </button>
                                    </div>

                                    <div className="mt-4 flex gap-3">
                                        <div className="flex-1 relative">
                                            <KeyIcon className="w-4 h-4 absolute left-3 top-3 text-text-muted opacity-60" />
                                            <input
                                                type="password"
                                                placeholder="Paste API key"
                                                value={apiKeys[p.provider] || ''}
                                                onChange={(e) => setApiKeys((prev) => ({ ...prev, [p.provider]: e.target.value }))}
                                                className="w-full bg-panel border border-border-base rounded-xl pl-10 pr-4 py-2.5 text-sm text-text-main focus:ring-2 focus:ring-wispr-purple/20 focus:outline-none transition-all"
                                            />
                                        </div>
                                        <button
                                            onClick={() => setKey(p.provider)}
                                            disabled={busyProvider !== null || !(apiKeys[p.provider] || '').trim()}
                                            className="px-4 py-2.5 bg-wispr-purple text-white rounded-xl text-xs font-bold shadow-lg shadow-wispr-purple/20 hover:bg-wispr-purple-dark disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                        >
                                            SAVE
                                        </button>
                                        <button
                                            onClick={() => clearKey(p.provider)}
                                            disabled={busyProvider !== null}
                                            className="px-3 py-2.5 bg-panel border border-border-base rounded-xl text-xs font-bold text-text-muted hover:text-rose-500 hover:border-rose-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                            title="Clear key"
                                        >
                                            <TrashIcon className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="bg-panel border border-border-base rounded-3xl p-6">
                    <div className="mb-4">
                        <h2 className="text-lg font-bold text-text-main">Model Registry</h2>
                        <p className="text-xs text-text-muted mt-1">This list is the source of truth for dropdowns in Experiments.</p>
                    </div>

                    {loading ? (
                        <div className="py-10 text-center text-text-muted italic">Loading models...</div>
                    ) : (
                        <div className="space-y-6">
                            {Object.keys(grouped).length === 0 && (
                                <div className="py-10 text-center text-text-muted italic">No models yet. Click Sync.</div>
                            )}
                            {(Object.entries(grouped) as [string, ModelRegistry[]][]).map(([provider, items]) => (
                                <div key={provider}>
                                    <div className="text-[10px] font-bold uppercase tracking-widest text-text-muted opacity-60 mb-2">{provider}</div>
                                    <div className="border border-border-base rounded-2xl overflow-hidden bg-app">
                                        <div className="grid grid-cols-12 gap-4 px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-text-muted border-b border-border-base bg-app/60">
                                            <div className="col-span-6">Model</div>
                                            <div className="col-span-4">ID</div>
                                            <div className="col-span-2 text-right">Enabled</div>
                                        </div>
                                        <div className="divide-y divide-border-base/50">
                                            {items.map((m) => (
                                                <div key={m.id} className="grid grid-cols-12 gap-4 px-5 py-3 text-xs text-text-main">
                                                    <div className="col-span-6 font-semibold truncate">{m.display_name || m.model_id}</div>
                                                    <div className="col-span-4 text-text-muted truncate">{m.model_id}</div>
                                                    <div className="col-span-2 flex justify-end">
                                                        <button
                                                            onClick={() => toggleModel(m.id, !m.enabled)}
                                                            className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border transition-all ${m.enabled
                                                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                                                                : 'bg-panel text-text-muted border-border-base hover:border-border-hover'
                                                                }`}
                                                        >
                                                            {m.enabled ? 'ON' : 'OFF'}
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Settings;
