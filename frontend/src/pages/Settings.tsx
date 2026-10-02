import React, { useState } from 'react';
import { ProviderSettingsPanel } from '../features/settings/ProviderSettingsPanel';
import { useProviderSettings } from '../features/settings/useProviderSettings';
import {
    ArrowPathIcon,
    ChevronDownIcon,
    ChevronRightIcon,
    CheckCircleIcon,
} from '@heroicons/react/24/outline';
import { Button, Card } from '../components/ui';
import { PageHeader } from '../layouts/PageHeader';
import { ACCENT_OPTIONS, AccentId, getStoredAccent, setAccent as applyAccent } from '../lib/theme/accent';

const ACCENT_PREVIEWS: Record<AccentId, { base: string; glow: string; subtle: string }> = {
    sage: { base: '#10A37F', glow: '#7BDCB5', subtle: '#E6F5F1' },
    amber: { base: '#D16A3A', glow: '#F4B894', subtle: '#F7E1D6' },
    copper: { base: '#B7794A', glow: '#E3B88E', subtle: '#F3E7DC' },
    coral: { base: '#E1705C', glow: '#F4B2A7', subtle: '#FCE4DF' },
};



const Settings: React.FC = () => {
    const providerSettings = useProviderSettings();
    const { sync, busyProvider } = providerSettings;
    const [accent, setAccentState] = useState<AccentId>(() => getStoredAccent());
    const [showAppearance, setShowAppearance] = useState(false);

    const handleAccentChange = (nextAccent: AccentId) => {
        setAccentState(nextAccent);
        applyAccent(nextAccent);
    };

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
                <ProviderSettingsPanel settings={providerSettings} />

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
