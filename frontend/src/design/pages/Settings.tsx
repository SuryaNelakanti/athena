import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import { ModelRegistry } from '../../types';
import { ArrowPathIcon, KeyIcon, TrashIcon } from '@heroicons/react/24/outline';
import { Button, Card, Input, SectionHeader, Select } from '../ui';
import { ACCENT_OPTIONS, AccentId, getStoredAccent, setAccent } from '../theme/accent';

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
    const [accent, setAccentState] = useState<AccentId>(getStoredAccent());

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

    const handleAccentChange = (value: AccentId) => {
        setAccentState(value);
        setAccent(value);
    };

    return (
        <div className="p-8 h-full overflow-y-auto bg-app transition-colors duration-300">
            <div className="mb-8">
                <SectionHeader
                    title="Settings"
                    subtitle="Local provider keys (in-memory) and the curated model registry."
                />
            </div>

            {error && (
                <div className="mb-6 bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 rounded-md p-4 text-sm font-semibold">
                    {error}
                </div>
            )}

            <Card className="p-6 mb-8">
                <div className="flex items-start justify-between gap-6">
                    <div>
                        <h2 className="text-lg font-bold text-text-main">Appearance</h2>
                        <p className="text-xs text-text-muted mt-1">Set the global accent applied to highlights, charts, and key actions.</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-md border border-border-base bg-primary shadow-xs" />
                        <div className="text-xs text-text-muted">Active accent</div>
                    </div>
                </div>
                <div className="mt-5 grid gap-4 md:grid-cols-[220px,1fr]">
                    <div>
                        <label className="text-[11px] font-medium text-text-muted">Accent color</label>
                        <Select
                            value={accent}
                            onChange={(e) => handleAccentChange(e.target.value as AccentId)}
                        >
                            {ACCENT_OPTIONS.map((option) => (
                                <option key={option.id} value={option.id}>
                                    {option.label}
                                </option>
                            ))}
                        </Select>
                    </div>
                    <div className="text-xs text-text-muted leading-relaxed">
                        Accent choice is saved locally and applies immediately across the UI.
                    </div>
                </div>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
                <Card className="p-6">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h2 className="text-lg font-bold text-text-main">Provider Keys</h2>
                            <p className="text-xs text-text-muted mt-1">Keys are stored only in memory and are lost on restart.</p>
                        </div>
                        <Button
                            onClick={() => sync()}
                            disabled={busyProvider !== null}
                            variant="primary"
                            size="sm"
                        >
                            <ArrowPathIcon className={`w-4 h-4 ${busyProvider ? 'animate-spin' : ''}`} />
                            Sync All Models
                        </Button>
                    </div>

                    {loading ? (
                        <div className="py-10 text-center text-text-muted italic">Loading providers...</div>
                    ) : (
                        <div className="space-y-4">
                            {providers.map((p) => (
                                <Card key={p.provider} className="bg-app p-5">
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
                                        <Button
                                            onClick={() => sync(p.provider)}
                                            disabled={busyProvider !== null}
                                            variant="secondary"
                                            size="sm"
                                        >
                                            Sync
                                        </Button>
                                    </div>

                                    <div className="mt-4 flex gap-3">
                                        <div className="flex-1 relative">
                                            <KeyIcon className="w-4 h-4 absolute left-3 top-3 text-text-muted opacity-60" />
                                            <Input
                                                type="password"
                                                placeholder="Paste API key"
                                                value={apiKeys[p.provider] || ''}
                                                onChange={(e) => setApiKeys((prev) => ({ ...prev, [p.provider]: e.target.value }))}
                                                className="pl-10"
                                            />
                                        </div>
                                        <Button
                                            onClick={() => setKey(p.provider)}
                                            disabled={busyProvider !== null || !(apiKeys[p.provider] || '').trim()}
                                            variant="primary"
                                            size="sm"
                                        >
                                            Save
                                        </Button>
                                        <Button
                                            onClick={() => clearKey(p.provider)}
                                            disabled={busyProvider !== null}
                                            variant="outline"
                                            size="sm"
                                            className="text-rose-500 hover:text-rose-600"
                                            title="Clear key"
                                        >
                                            <TrashIcon className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    )}
                </Card>

                <Card className="p-6">
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
                                    <div className="border border-border-base rounded-lg overflow-hidden bg-app">
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
                                                        <Button
                                                            onClick={() => toggleModel(m.id, !m.enabled)}
                                                            variant={m.enabled ? 'success' : 'secondary'}
                                                            size="sm"
                                                            className="rounded-full text-[10px] font-bold uppercase tracking-widest px-3"
                                                        >
                                                            {m.enabled ? 'On' : 'Off'}
                                                        </Button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
};

export default Settings;

