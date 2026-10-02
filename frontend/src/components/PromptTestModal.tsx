import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { getErrorMessage } from '../lib/errors';
import { Button, Input, Modal, Select, Textarea } from './ui';
import { ScorerConfig, ModelRegistry, Function } from '../types';
import { XMarkIcon } from '@heroicons/react/24/outline';

interface PromptTestModalProps {
    open: boolean;
    onClose: () => void;
    projectId: string;
    datasetId: string;
    onSuccess?: (testId: string) => void;
}

export const PromptTestModal: React.FC<PromptTestModalProps> = ({
    open,
    onClose,
    projectId,
    datasetId,
    onSuccess
}) => {

    const [models, setModels] = useState<ModelRegistry[]>([]);
    const [availableScorers, setAvailableScorers] = useState<Function[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [optionsLoading, setOptionsLoading] = useState(false);
    const [optionsError, setOptionsError] = useState<string | null>(null);
    const [optionsReloadKey, setOptionsReloadKey] = useState(0);

    const [testConfig, setTestConfig] = useState({
        name: '',
        model_id: '',
        system_prompt: '',
        prompt_template: '',
        scorers: [] as ScorerConfig[],
        parameters: {
            temperature: 1.0,
            max_tokens: ''
        }
    });

    useEffect(() => {
        if (!open) return;

        let isCurrent = true;
        setOptionsLoading(true);
        setOptionsError(null);
        setModels([]);
        setAvailableScorers([]);

        const loadOptions = async () => {
            try {
                const [modelsData, scorersData] = await Promise.all([
                    api.getModelRegistry(true),
                    api.getScorers(projectId)
                ]);
                if (!isCurrent) return;
                const availableModels = modelsData || [];
                setModels(availableModels);
                setAvailableScorers((scorersData || []).filter((s: Function) => s.type === 'scorer' && s.enabled));
                setTestConfig((previous) => {
                    const selectedModelExists = availableModels.some((model) => model.id === previous.model_id);
                    return selectedModelExists || availableModels.length === 0
                        ? previous
                        : { ...previous, model_id: availableModels[0].id };
                });
            } catch (err: unknown) {
                if (isCurrent) setOptionsError(getErrorMessage(err, 'Failed to load models and scorers'));
            } finally {
                if (isCurrent) setOptionsLoading(false);
            }
        };
        void loadOptions();
        return () => { isCurrent = false; };
    }, [open, projectId, optionsReloadKey]);

    const handleAddScorer = (type: string) => {
        if (testConfig.scorers.some(s => s.type === type)) return;
        setTestConfig(prev => ({
            ...prev,
            scorers: [...prev.scorers, { type, weight: 1.0, threshold: 0.8 }]
        }));
    };

    const removeScorer = (type: string) => {
        setTestConfig(prev => ({
            ...prev,
            scorers: prev.scorers.filter(s => s.type !== type)
        }));
    };

    const updateScorer = (type: string, field: keyof ScorerConfig, value: unknown) => {
        setTestConfig(prev => ({
            ...prev,
            scorers: prev.scorers.map(s => s.type === type ? { ...s, [field]: value } : s)
        }));
    };

    const handleSubmit = async () => {
        if (!testConfig.model_id) {
            setError("Please select a model");
            return;
        }
        setError(null);
        setLoading(true);

        try {
            const selectedModel = models.find(m => m.id === testConfig.model_id);

            // Create the prompt test
            const payload = {
                project_id: projectId,
                dataset_id: datasetId,
                name: testConfig.name || `Test - ${new Date().toLocaleString()}`,
                prompt_config: {
                    model_id: selectedModel?.model_id,
                    provider: selectedModel?.provider,
                    system_prompt: testConfig.system_prompt,
                    prompt_template: testConfig.prompt_template,
                    parameters: {
                        temperature: Number(testConfig.parameters.temperature),
                        max_tokens: testConfig.parameters.max_tokens ? Number(testConfig.parameters.max_tokens) : undefined
                    }
                },
                success_criteria: testConfig.scorers.map(s => ({
                    type: s.type,
                    start_val: 0,
                    weight: Number(s.weight),
                    threshold: Number(s.threshold),
                    config: {} // Scorer specific config if any
                }))
            };

            const created = await api.createPromptTest(payload);

            // Run it immediately (or queue it)
            await api.runPromptTest(created.id);

            onClose();
            if (onSuccess) onSuccess(created.id);
        } catch (err: unknown) {
            setError(getErrorMessage(err, 'Failed to create/run test'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Design Prompt Test"
            description="Configure prompt and success criteria to evaluate."
            footer={
                <div className="flex justify-end gap-2">
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button variant="primary" onClick={handleSubmit} disabled={loading}>
                        {loading ? 'Starting...' : 'Run Test'}
                    </Button>
                </div>
            }
        >
            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
                {error && <div className="text-sm text-rose-500">{error}</div>}
                {optionsLoading && <div className="text-xs text-text-muted">Loading models and scorers...</div>}
                {optionsError && (
                    <div role="alert" className="flex items-center justify-between gap-3 text-sm text-rose-500">
                        <span>{optionsError}</span>
                        <Button variant="secondary" size="sm" onClick={() => setOptionsReloadKey((current) => current + 1)}>
                            Retry
                        </Button>
                    </div>
                )}

                <div className="space-y-3">
                    <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">Configuration</label>
                    <Input
                        placeholder="Test Name (Optional)"
                        value={testConfig.name}
                        onChange={e => setTestConfig({ ...testConfig, name: e.target.value })}
                    />

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-[11px] text-text-muted block mb-1">Model</label>
                            <Select
                                value={testConfig.model_id}
                                onChange={e => setTestConfig({ ...testConfig, model_id: e.target.value })}
                            >
                                <option value="">Select Model</option>
                                {models.map(m => (
                                    <option key={m.id} value={m.id}>{m.id} ({m.provider})</option>
                                ))}
                            </Select>
                        </div>
                        <div>
                            <label className="text-[11px] text-text-muted block mb-1">Temperature</label>
                            <Input
                                type="number"
                                step="0.1"
                                value={testConfig.parameters.temperature}
                                onChange={e => setTestConfig({
                                    ...testConfig,
                                    parameters: { ...testConfig.parameters, temperature: parseFloat(e.target.value) }
                                })}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="text-[11px] text-text-muted block mb-1">System Prompt</label>
                        <Textarea
                            className="h-20"
                            placeholder="You are a helpful assistant..."
                            value={testConfig.system_prompt}
                            onChange={e => setTestConfig({ ...testConfig, system_prompt: e.target.value })}
                        />
                    </div>

                    <div>
                        <label className="text-[11px] text-text-muted block mb-1">Prompt Template</label>
                        <Textarea
                            className="h-24 font-mono text-xs"
                            placeholder="Answer the user question: {{input}}"
                            value={testConfig.prompt_template}
                            onChange={e => setTestConfig({ ...testConfig, prompt_template: e.target.value })}
                        />
                        <p className="text-[10px] text-text-muted mt-1">Use <code>{`{{input}}`}</code> or <code>{`{{key}}`}</code> for row variables.</p>
                    </div>
                </div>

                <div className="space-y-3 pt-4 border-t border-border-hairline">
                    <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">Success Criteria</label>
                        <Select
                            className="w-40 h-8 text-xs py-0"
                            value=""
                            onChange={e => handleAddScorer(e.target.value)}
                        >
                            <option value="">Add Scorer...</option>
                            {availableScorers.map(s => (
                                <option key={s.name} value={s.name}>{s.display_name || s.name}</option>
                            ))}
                        </Select>
                    </div>

                    <div className="space-y-2">
                        {testConfig.scorers.length === 0 && (
                            <div className="text-xs text-text-muted italic">No scorers selected. Results will be unscored.</div>
                        )}
                        {testConfig.scorers.map(scorer => (
                            <div key={scorer.type} className="flex items-center gap-2 p-2 rounded bg-panel border border-border-base">
                                <div className="flex-1 text-sm font-medium">{scorer.type}</div>
                                <div className="w-20">
                                    <Input
                                        type="number"
                                        className="h-7 text-xs"
                                        placeholder="Threshold"
                                        value={scorer.threshold}
                                        onChange={e => updateScorer(scorer.type, 'threshold', e.target.value)}
                                    />
                                </div>
                                <Button variant="ghost" size="sm" onClick={() => removeScorer(scorer.type)}>
                                    <XMarkIcon className="w-4 h-4 text-text-muted hover:text-rose-500" />
                                </Button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </Modal>
    );
};
