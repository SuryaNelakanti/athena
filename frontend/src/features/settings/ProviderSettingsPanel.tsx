import {
  ArrowPathIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CpuChipIcon,
  KeyIcon,
  SparklesIcon,
  TrashIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import { Badge, Button, Card, Input } from '../../components/ui';
import type { ProviderId, ProviderSettingsController } from './useProviderSettings';

const PROVIDER_INFO: Record<ProviderId, { name: string; description: string }> = {
  openai: { name: 'OpenAI', description: 'GPT-4, GPT-3.5, and more' },
  anthropic: { name: 'Anthropic', description: 'Claude 3 family' },
  gemini: { name: 'Google Gemini', description: 'Gemini Pro and Flash' },
  groq: { name: 'Groq', description: 'Llama, GPT-OSS, Whisper on LPU' },
  mock: { name: 'Mock Provider', description: 'For testing' },
};

type ProviderSettingsPanelProps = {
  settings: ProviderSettingsController;
};

export const ProviderSettingsPanel = ({ settings }: ProviderSettingsPanelProps) => {
  const {
    providers,
    models,
    loading,
    error,
    apiKeys,
    busyProvider,
    expandedProviders,
    sync,
    setKey,
    clearKey,
    updateApiKey,
    toggleModel,
    soloModel,
    setAllModels,
    toggleProvider,
  } = settings;
  const getProviderModels = (provider: ProviderId) =>
    models.filter((model) => model.provider === provider)
      .sort((left, right) => Number(right.enabled) - Number(left.enabled));
  const configuredCount = providers.filter((provider) => provider.configured).length;
  const totalModels = models.length;
  const enabledModels = models.filter((model) => model.enabled).length;

  return (
    <>
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
                                                            onChange={(e) => updateApiKey(p.provider, e.target.value)}
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
                                                        {/* Header with bulk actions */}
                                                        <div className="flex items-center justify-between px-4 py-2 border-b border-border-hairline bg-app/30">
                                                            <div className="text-[9px] font-bold uppercase tracking-widest text-text-muted">
                                                                {providerModels.filter(m => m.enabled).length} of {providerModels.length} enabled
                                                            </div>
                                                            <div className="flex items-center gap-1">
                                                                <button
                                                                    onClick={() => setAllModels(p.provider, true)}
                                                                    disabled={busyProvider !== null}
                                                                    className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-text-muted hover:text-emerald-600 hover:bg-emerald-500/10 rounded transition-colors"
                                                                >
                                                                    All On
                                                                </button>
                                                                <span className="text-border-base">|</span>
                                                                <button
                                                                    onClick={() => setAllModels(p.provider, false)}
                                                                    disabled={busyProvider !== null}
                                                                    className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-text-muted hover:text-rose-600 hover:bg-rose-500/10 rounded transition-colors"
                                                                >
                                                                    All Off
                                                                </button>
                                                            </div>
                                                        </div>
                                                        <div className="divide-y divide-border-hairline/50 max-h-64 overflow-y-auto">
                                                            {providerModels.map((m) => (
                                                                <div key={m.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-panel-hover transition-colors group">
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="text-xs font-medium text-text-main truncate">
                                                                            {m.display_name || m.model_id}
                                                                        </div>
                                                                        <div className="text-[10px] text-text-muted truncate">
                                                                            {m.model_id}
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex items-center gap-1.5 ml-2">
                                                                        {/* Solo button - enables only this model */}
                                                                        <button
                                                                            onClick={() => soloModel(m.id, p.provider)}
                                                                            disabled={busyProvider !== null}
                                                                            title="Use only this model (disable others)"
                                                                            className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider transition-colors ${m.enabled && providerModels.filter(x => x.enabled).length === 1
                                                                                    ? 'bg-primary/15 text-primary'
                                                                                    : 'bg-transparent text-text-muted opacity-0 group-hover:opacity-100 hover:bg-primary/10 hover:text-primary'
                                                                                }`}
                                                                        >
                                                                            Solo
                                                                        </button>
                                                                        {/* Toggle button */}
                                                                        <button
                                                                            onClick={() => toggleModel(m.id, !m.enabled)}
                                                                            disabled={busyProvider !== null}
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

    </>
  );
};
