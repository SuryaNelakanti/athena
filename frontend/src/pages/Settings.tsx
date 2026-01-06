import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { ModelRegistry } from '../types';
import {
    ArrowPathIcon,
    KeyIcon,
    TrashIcon,
    ChevronDownIcon,
    ChevronRightIcon,
    CheckCircleIcon,
    XCircleIcon,
    SparklesIcon,
    CpuChipIcon
} from '@heroicons/react/24/outline';
import { Badge, Button, Card, Input } from '../components/ui';
import { PageHeader } from '../layouts/PageHeader';
import { ACCENT_OPTIONS, AccentId, getStoredAccent, setAccent as applyAccent } from '../lib/theme/accent';

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

const PROVIDER_INFO: Record<ProviderId, { name: string; color: string; description: string }> = {
    openai: { name: 'OpenAI', color: 'emerald', description: 'GPT-4, GPT-3.5, and more' },
    anthropic: { name: 'Anthropic', color: 'amber', description: 'Claude 3 family' },
    gemini: { name: 'Google Gemini', color: 'sky', description: 'Gemini Pro and Flash' },
    mock: { name: 'Mock Provider', color: 'slate', description: 'For testing' },
};

const Settings: React.FC = () => {
    const [providers, setProviders] = useState<ProviderStatus[]>([]);
    const [models, setModels] = useState<ModelRegistry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
    const [busyProvider, setBusyProvider] = useState<string | null>(null);
    const [accent, setAccentState] = useState<AccentId>(() => getStoredAccent());
    const [expandedProviders, setExpandedProviders] = useState<Set<ProviderId>>(new Set());
    const [showAppearance, setShowAppearance] = useState(false);

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const [ps, ms] = await Promise.all([api.getProviderStatuses(), api.getModelRegistry(false)]);
            setProviders(ps);
            setModels(ms);
            // Auto-expand configured providers
            const configured = new Set(ps.filter(p => p.configured).map(p => p.provider));
            setExpandedProviders(configured);
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
            await api.syncModelRegistry({ provider });
            await load();
            // Expand the provider to show models
            setExpandedProviders(prev => new Set([...prev, provider]));
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

    const toggleProvider = (provider: ProviderId) => {
        setExpandedProviders(prev => {
            const next = new Set(prev);
            if (next.has(provider)) {
                next.delete(provider);
            } else {
                next.add(provider);
            }
            return next;
        });
    };

    const getProviderModels = (provider: ProviderId) => {
        return models.filter(m => m.provider === provider).sort((a, b) => Number(b.enabled) - Number(a.enabled));
    };

    const configuredCount = providers.filter(p => p.configured).length;
    const totalModels = models.length;
    const enabledModels = models.filter(m => m.enabled).length;

    return (
        <div className="h-full flex flex-col bg-app">
            <PageHeader
                title="Settings"
                subtitle="Provider keys, model registry, and appearance"
                actions={
                    <Button
                        onClick={() => sync()}
                        disabled={busyProvider !== null}
                        variant="secondary"
                        size="sm"
                    >
                        <ArrowPathIcon className={`w-3.5 h-3.5 ${busyProvider ? 'animate-spin' : ''}`} />
                        Sync All
                    </Button>
                }
            />

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {error && (
                    <div className="bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 rounded-lg p-4 text-sm font-medium animate-soft-in">
                        {error}
                    </div>
                )}

                {/* Stats Bar */}
                <div className="grid grid-cols-3 gap-4">
                    <Card className="p-4 flex items-center gap-3">
                        <div className="icon-chip icon-chip--sky">
                            <CpuChipIcon className="w-4 h-4" />
                        </div>
                        <div>
                            <div className="text-lg font-bold text-text-main">{configuredCount}</div>
                            <div className="text-[10px] uppercase tracking-wider text-text-muted">Providers</div>
                        </div>
                    </Card>
                    <Card className="p-4 flex items-center gap-3">
                        <div className="icon-chip icon-chip--amber">
                            <SparklesIcon className="w-4 h-4" />
                        </div>
                        <div>
                            <div className="text-lg font-bold text-text-main">{totalModels}</div>
                            <div className="text-[10px] uppercase tracking-wider text-text-muted">Models</div>
                        </div>
                    </Card>
                    <Card className="p-4 flex items-center gap-3">
                        <div className="icon-chip icon-chip--emerald">
                            <CheckCircleIcon className="w-4 h-4" />
                        </div>
                        <div>
                            <div className="text-lg font-bold text-text-main">{enabledModels}</div>
                            <div className="text-[10px] uppercase tracking-wider text-text-muted">Enabled</div>
                        </div>
                    </Card>
                </div>

                {/* AI Providers Section */}
                <Card className="overflow-hidden">
                    <div className="px-5 py-4 border-b border-border-hairline bg-panel/50">
                        <h2 className="text-sm font-bold text-text-main">AI Providers</h2>
                        <p className="text-[11px] text-text-muted mt-0.5">Configure API keys and manage available models</p>
                    </div>

                    {loading ? (
                        <div className="p-10 text-center text-text-muted text-sm animate-pulse">Loading providers...</div>
                    ) : (
                        <div className="divide-y divide-border-hairline">
                            {providers.filter(p => p.provider !== 'mock').map((p, idx) => {
                                const info = PROVIDER_INFO[p.provider];
                                const isExpanded = expandedProviders.has(p.provider);
                                const providerModels = getProviderModels(p.provider);

                                return (
                                    <div key={p.provider} className="animate-soft-in" style={{ animationDelay: `${idx * 30}ms` }}>
                                        {/* Provider Header */}
                                        <div
                                            onClick={() => toggleProvider(p.provider)}
                                            className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-panel-hover transition-colors"
                                        >
                                            <div className="flex items-center gap-3">
                                                <button className="p-1 -ml-1">
                                                    {isExpanded ? (
                                                        <ChevronDownIcon className="w-4 h-4 text-text-muted" />
                                                    ) : (
                                                        <ChevronRightIcon className="w-4 h-4 text-text-muted" />
                                                    )}
                                                </button>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-semibold text-text-main">{info.name}</span>
                                                        {p.configured ? (
                                                            <Badge variant="success" className="text-[9px]">Configured</Badge>
                                                        ) : (
                                                            <Badge variant="neutral" className="text-[9px]">Not Set</Badge>
                                                        )}
                                                        {providerModels.length > 0 && (
                                                            <span className="text-[10px] text-text-muted">
                                                                {providerModels.filter(m => m.enabled).length}/{providerModels.length} models
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-[11px] text-text-muted">{info.description}</div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                                <Button
                                                    onClick={() => sync(p.provider)}
                                                    disabled={busyProvider !== null || !p.configured}
                                                    variant="ghost"
                                                    size="sm"
                                                    title="Sync models"
                                                >
                                                    <ArrowPathIcon className={`w-3.5 h-3.5 ${busyProvider === p.provider ? 'animate-spin' : ''}`} />
                                                </Button>
                                            </div>
                                        </div>

                                        {/* Expanded Content */}
                                        {isExpanded && (
                                            <div className="px-5 pb-4 space-y-4 bg-app/50 animate-soft-in">
                                                {/* API Key Input */}
                                                <div className="flex gap-3">
                                                    <div className="flex-1 relative">
                                                        <KeyIcon className="w-4 h-4 absolute left-3 top-2.5 text-text-muted opacity-60" />
                                                        <Input
                                                            type="password"
                                                            placeholder={p.configured ? '••••••••••••••••' : 'Paste API key'}
                                                            value={apiKeys[p.provider] || ''}
                                                            onChange={(e) => setApiKeys((prev) => ({ ...prev, [p.provider]: e.target.value }))}
                                                            className="pl-10 text-xs"
                                                        />
                                                    </div>
                                                    <Button
                                                        onClick={() => setKey(p.provider)}
                                                        disabled={busyProvider !== null || !(apiKeys[p.provider] || '').trim()}
                                                        variant="primary"
                                                        size="sm"
                                                    >
                                                        {busyProvider === p.provider ? 'Saving...' : 'Save'}
                                                    </Button>
                                                    {p.configured && (
                                                        <Button
                                                            onClick={() => clearKey(p.provider)}
                                                            disabled={busyProvider !== null}
                                                            variant="ghost"
                                                            size="sm"
                                                            className="text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
                                                            title="Clear key"
                                                        >
                                                            <TrashIcon className="w-4 h-4" />
                                                        </Button>
                                                    )}
                                                </div>

                                                {/* Models List */}
                                                {providerModels.length > 0 && (
                                                    <div className="border border-border-hairline rounded-lg overflow-hidden bg-panel">
                                                        <div className="grid grid-cols-12 gap-2 px-4 py-2 text-[9px] font-bold uppercase tracking-widest text-text-muted border-b border-border-hairline bg-app/30">
                                                            <div className="col-span-7">Model</div>
                                                            <div className="col-span-3">ID</div>
                                                            <div className="col-span-2 text-right">Status</div>
                                                        </div>
                                                        <div className="divide-y divide-border-hairline/50 max-h-48 overflow-y-auto">
                                                            {providerModels.map((m) => (
                                                                <div key={m.id} className="grid grid-cols-12 gap-2 px-4 py-2.5 text-xs hover:bg-panel-hover transition-colors">
                                                                    <div className="col-span-7 font-medium text-text-main truncate">
                                                                        {m.display_name || m.model_id}
                                                                    </div>
                                                                    <div className="col-span-3 text-text-muted truncate text-[11px]">
                                                                        {m.model_id}
                                                                    </div>
                                                                    <div className="col-span-2 flex justify-end">
                                                                        <button
                                                                            onClick={() => toggleModel(m.id, !m.enabled)}
                                                                            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-colors ${m.enabled
                                                                                ? 'bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25'
                                                                                : 'bg-panel-hover text-text-muted hover:bg-panel-hover/80'
                                                                                }`}
                                                                        >
                                                                            {m.enabled ? (
                                                                                <>
                                                                                    <CheckCircleIcon className="w-3 h-3" />
                                                                                    On
                                                                                </>
                                                                            ) : (
                                                                                <>
                                                                                    <XCircleIcon className="w-3 h-3" />
                                                                                    Off
                                                                                </>
                                                                            )}
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {providerModels.length === 0 && p.configured && (
                                                    <div className="text-center py-4 text-text-muted text-xs">
                                                        No models synced. Click Sync to fetch available models.
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </Card>

                {/* Appearance Section - Collapsible */}
                <Card className="overflow-hidden">
                    <button
                        onClick={() => setShowAppearance(!showAppearance)}
                        className="w-full flex items-center justify-between px-5 py-4 hover:bg-panel-hover transition-colors"
                    >
                        <div>
                            <h2 className="text-sm font-bold text-text-main text-left">Appearance</h2>
                            <p className="text-[11px] text-text-muted mt-0.5 text-left">Accent colors and theme customization</p>
                        </div>
                        {showAppearance ? (
                            <ChevronDownIcon className="w-4 h-4 text-text-muted" />
                        ) : (
                            <ChevronRightIcon className="w-4 h-4 text-text-muted" />
                        )}
                    </button>

                    {showAppearance && (
                        <div className="px-5 pb-5 border-t border-border-hairline bg-app/50 animate-soft-in">
                            <div className="pt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                                {ACCENT_OPTIONS.map((option) => {
                                    const preview = ACCENT_PREVIEWS[option.id];
                                    const isActive = accent === option.id;
                                    return (
                                        <button
                                            key={option.id}
                                            onClick={() => handleAccentChange(option.id)}
                                            aria-pressed={isActive}
                                            className={`relative text-left rounded-lg border p-3 transition-all ${isActive
                                                ? 'border-primary/50 bg-primary/5 shadow-sm'
                                                : 'border-border-base bg-panel hover:border-border-hover'
                                                }`}
                                        >
                                            <div className="flex items-center gap-2">
                                                <div
                                                    className="h-6 w-6 rounded-lg border border-border-base shadow-sm"
                                                    style={{ background: `linear-gradient(135deg, ${preview.base}, ${preview.glow})` }}
                                                />
                                                <span className="text-xs font-semibold text-text-main">{option.label}</span>
                                            </div>
                                            <div className="mt-2 h-1 rounded-full" style={{ background: `linear-gradient(90deg, ${preview.base}, ${preview.glow})` }} />
                                            {isActive && (
                                                <div className="absolute top-2 right-2">
                                                    <CheckCircleIcon className="w-4 h-4 text-primary" />
                                                </div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
};

export default Settings;
