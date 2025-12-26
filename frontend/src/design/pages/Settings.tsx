import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import { ModelRegistry } from '../../types';
import { ArrowPathIcon, KeyIcon, TrashIcon } from '@heroicons/react/24/outline';
import { Badge, Button, Card, Input } from '../ui';
import { PageHeader } from '../layout/PageHeader';
import { ACCENT_OPTIONS, AccentId, getStoredAccent, setAccent as applyAccent } from '../theme/accent';

type ProviderId = 'openai' | 'anthropic' | 'gemini' | 'mock';

type ProviderStatus = {
    provider: ProviderId;
    configured: boolean;
    updated_at_ms: number | null;
};

const ACCENT_PREVIEWS: Record<AccentId, { base: string; glow: string; subtle: string }> = {
    sage: { base: '#10A37F', glow: '#7BDCB5', subtle: '#E6F5F1' },
    amber: { base: '#D16A3A', glow: '#F4B894', subtle: '#F7E1D6' },
    copper: { base: '#B7794A', glow: '#E3B88E', subtle: '#F3E7DC' },
    coral: { base: '#E1705C', glow: '#F4B2A7', subtle: '#FCE4DF' },
};

const Settings: React.FC = () => {
    const [providers, setProviders] = useState<ProviderStatus[]>([]);
    const [models, setModels] = useState<ModelRegistry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
    const [busyProvider, setBusyProvider] = useState<string | null>(null);
    const [accent, setAccentState] = useState<AccentId>(() => getStoredAccent());

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

    const handleAccentChange = (nextAccent: AccentId) => {
        setAccentState(nextAccent);
        applyAccent(nextAccent);
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
        <div className="h-full flex flex-col bg-app">
            <PageHeader
                title="Settings"
                subtitle="Provider keys and model registry configuration."
            />

            <div className="flex-1 overflow-y-auto p-6">
                {error && (
                    <div className="mb-6 bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 rounded-md p-4 text-sm font-semibold">
                        {error}
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                    <Card className="p-6 lg:col-span-2">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h2 className="text-lg font-bold text-text-main">Appearance</h2>
                                <p className="text-xs text-text-muted mt-1">Swap accent palettes for highlights, charts, and actions.</p>
                            </div>
                            <div className="hidden md:flex items-center gap-2 text-[10px] uppercase tracking-widest text-text-muted font-bold">
                                <span className="px-2 py-1 rounded-full border border-border-base bg-app">A/B Palettes</span>
                                <span className="text-[9px] opacity-60">Saved locally</span>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            {ACCENT_OPTIONS.map((option) => {
                                const preview = ACCENT_PREVIEWS[option.id];
                                const isActive = accent === option.id;
                                return (
                                    <button
                                        key={option.id}
                                        onClick={() => handleAccentChange(option.id)}
                                        aria-pressed={isActive}
                                        className={`group relative text-left rounded-xl border px-4 py-4 transition-all ${isActive
                                                ? 'border-primary/50 bg-primary/5 shadow-sm'
                                                : 'border-border-base bg-panel hover:border-border-hover hover:-translate-y-0.5'
                                            }`}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <div className="text-[10px] uppercase tracking-widest text-text-muted font-bold">{option.label}</div>
                                                <div className="text-xs text-text-muted mt-1">Accent</div>
                                            </div>
                                            <div
                                                className="h-10 w-10 rounded-xl border border-border-base shadow-sm"
                                                style={{ background: `linear-gradient(135deg, ${preview.base}, ${preview.glow})` }}
                                            />
                                        </div>
                                        <div className="mt-4 flex items-center gap-2">
                                            <span
                                                className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border"
                                                style={{ color: preview.base, backgroundColor: preview.subtle, borderColor: preview.base }}
                                            >
                                                Primary
                                            </span>
                                            <span className="text-[10px] text-text-muted">Buttons & links</span>
                                        </div>
                                        <div className="mt-3 h-1.5 rounded-full" style={{ background: `linear-gradient(90deg, ${preview.base}, ${preview.glow})` }} />
                                        {isActive && (
                                            <div className="absolute top-3 right-3">
                                                <Badge variant="primary">Active</Badge>
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </Card>
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
                                <ArrowPathIcon className={`w-3.5 h-3.5 ${busyProvider ? 'animate-spin' : ''}`} />
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
        </div>
    );
};

export default Settings;
