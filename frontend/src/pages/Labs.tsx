import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowPathIcon,
  ArrowsRightLeftIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  PlayIcon,
  PlusIcon,
  StopIcon,
  XMarkIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline';
import { Badge, Button, Card, IconButton, Input, Select, Tabs, Textarea } from '../components/ui';
import { PageHeader } from '../layouts/PageHeader';
import { api, API_BASE_URL } from '../lib/api';
import { Dataset, ModelRegistry, Playground, Trace } from '../types';
import TraceDetail from './TraceDetail';
import { cx } from '../components/ui';

type MessageRole = 'user' | 'assistant';

type Message = {
  id: string;
  role: MessageRole;
  content: string;
};

type ModelOption = {
  id: string;
  label: string;
  provider?: string;
  registryId?: string;
};

type SnapshotStatus = 'idle' | 'saving' | 'success' | 'error';
type RunStatus = 'idle' | 'running' | 'success' | 'error' | 'canceled';

type PlaygroundVariant = {
  id: string;
  name: string;
  model: string;
  provider?: string;
  temperature: number;
  top_p: number;
  max_tokens: number | null;
};

type PlaygroundRun = {
  id: string;
  variantId: string;
  variantName: string;
  model: string;
  provider?: string;
  status: RunStatus;
  output: string;
  reasoning: string;
  traceId?: string;
  startedAt: number;
  completedAt?: number;
  error?: string;
};

type DiffChunk = { type: 'same' | 'add' | 'del'; text: string };

interface LabsProps {
  projectId: string;
}

const DEFAULT_SYSTEM_PROMPT =
  'You are Athena Playground. Be concise, explicit about assumptions, and show your work when asked.';
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_TOP_P = 1;
const DEFAULT_MAX_TOKENS = 512;
const NEW_PLAYGROUND_VALUE = '__new__';
const MAX_RUNS = 40;

const DEFAULT_MODELS: ModelOption[] = [
  { id: 'gpt-4o-mini', label: 'GPT-4o Mini', provider: 'openai' },
  { id: 'claude-3-5-sonnet-20240620', label: 'Claude 3.5 Sonnet', provider: 'anthropic' },
  { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', provider: 'gemini' },
  { id: 'mock-model-v1', label: 'Mock Model v1', provider: 'mock' },
];

const makeId = (prefix: string) => {
  const seed =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${seed}`;
};

const formatTime = (value?: number) => {
  if (!value) return '-';
  return new Date(value).toLocaleTimeString();
};

const formatDuration = (start?: number, end?: number) => {
  if (!start) return '-';
  const stop = end || Date.now();
  const delta = Math.max(stop - start, 0);
  if (delta >= 1000) return `${(delta / 1000).toFixed(1)}s`;
  return `${delta}ms`;
};

const formatShortId = (value?: string) => {
  if (!value) return '-';
  return value.slice(0, 8);
};

const getProviderLabel = (provider?: string) => {
  if (!provider) return 'Auto';
  if (provider === 'openai') return 'OpenAI';
  if (provider === 'anthropic') return 'Anthropic';
  if (provider === 'gemini') return 'Gemini';
  if (provider === 'mock') return 'Mock';
  return provider;
};

const runStatusVariant = (status: RunStatus) => {
  if (status === 'running') return 'primary';
  if (status === 'success') return 'success';
  if (status === 'error') return 'danger';
  if (status === 'canceled') return 'warning';
  return 'neutral';
};

const normalizeVariant = (variant: PlaygroundVariant, options: ModelOption[]) => {
  const available = options.length ? options : DEFAULT_MODELS;
  const match = available.find((model) => model.id === variant.model) || available[0];
  return {
    ...variant,
    model: match?.id || variant.model,
    provider: variant.provider || match?.provider,
    temperature: Number.isFinite(variant.temperature) ? variant.temperature : DEFAULT_TEMPERATURE,
    top_p: Number.isFinite(variant.top_p) ? variant.top_p : DEFAULT_TOP_P,
    max_tokens: variant.max_tokens ?? DEFAULT_MAX_TOKENS,
  };
};

const buildDefaultVariants = (options: ModelOption[]) => {
  const available = options.length ? options : DEFAULT_MODELS;
  const primary = available[0] || DEFAULT_MODELS[0];
  const secondary = available[1] || primary;
  return [
    {
      id: makeId('variant'),
      name: 'Primary',
      model: primary.id,
      provider: primary.provider,
      temperature: DEFAULT_TEMPERATURE,
      top_p: DEFAULT_TOP_P,
      max_tokens: DEFAULT_MAX_TOKENS,
    },
    {
      id: makeId('variant'),
      name: 'Alternate',
      model: secondary.id,
      provider: secondary.provider,
      temperature: DEFAULT_TEMPERATURE,
      top_p: DEFAULT_TOP_P,
      max_tokens: DEFAULT_MAX_TOKENS,
    },
  ];
};

const buildRequestMessages = (systemPrompt: string, messages: Message[], input: string) => {
  const payload: Array<{ role: string; content: string }> = [];
  if (systemPrompt.trim()) {
    payload.push({ role: 'system', content: systemPrompt.trim() });
  }
  messages.forEach((msg) => {
    if (msg.content.trim()) {
      payload.push({ role: msg.role, content: msg.content.trim() });
    }
  });
  if (input.trim()) {
    payload.push({ role: 'user', content: input.trim() });
  }
  return payload;
};

// Simple LCS diff for line comparisons without external dependencies.
const diffLines = (before: string, after: string): DiffChunk[] => {
  const a = before.split('\n');
  const b = after.split('\n');
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    Array(b.length + 1).fill(0)
  );

  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const chunks: DiffChunk[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      chunks.push({ type: 'same', text: a[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      chunks.push({ type: 'del', text: a[i] });
      i += 1;
    } else {
      chunks.push({ type: 'add', text: b[j] });
      j += 1;
    }
  }
  while (i < a.length) {
    chunks.push({ type: 'del', text: a[i] });
    i += 1;
  }
  while (j < b.length) {
    chunks.push({ type: 'add', text: b[j] });
    j += 1;
  }
  return chunks;
};
const Labs: React.FC<LabsProps> = ({ projectId }) => {
  const [playgrounds, setPlaygrounds] = useState<Playground[]>([]);
  const [selectedPlaygroundId, setSelectedPlaygroundId] = useState(NEW_PLAYGROUND_VALUE);
  const [activePlaygroundId, setActivePlaygroundId] = useState<string | null>(null);
  const [playgroundName, setPlaygroundName] = useState('Untitled Playground');
  const [playgroundDescription, setPlaygroundDescription] = useState('');
  const [savingPlayground, setSavingPlayground] = useState(false);
  const [savedSignature, setSavedSignature] = useState('');

  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [variants, setVariants] = useState<PlaygroundVariant[]>(() =>
    buildDefaultVariants(DEFAULT_MODELS)
  );
  const [showContext, setShowContext] = useState(false);

  const [runs, setRuns] = useState<PlaygroundRun[]>([]);
  const [runNotice, setRunNotice] = useState<string | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);

  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [modelRegistry, setModelRegistry] = useState<ModelRegistry[]>([]);
  const [snapshotDatasetId, setSnapshotDatasetId] = useState('');
  const [snapshotVariantId, setSnapshotVariantId] = useState('');
  const [snapshotName, setSnapshotName] = useState('');
  const [snapshotStatus, setSnapshotStatus] = useState<SnapshotStatus>('idle');
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [snapshotExperimentId, setSnapshotExperimentId] = useState<string | null>(null);

  const [compareLeftId, setCompareLeftId] = useState<string>('');
  const [compareRightId, setCompareRightId] = useState<string>('');
  const [compareMode, setCompareMode] = useState<'diff' | 'side'>('diff');
  const [compareTouched, setCompareTouched] = useState(false);

  const [traceModalOpen, setTraceModalOpen] = useState(false);
  const [traceLoading, setTraceLoading] = useState(false);
  const [traceError, setTraceError] = useState<string | null>(null);
  const [activeTrace, setActiveTrace] = useState<Trace | null>(null);

  const runControllersRef = useRef<Record<string, AbortController>>({});
  const traceCacheRef = useRef<Record<string, Trace>>({});

  const modelOptions = useMemo<ModelOption[]>(() => {
    if (!modelRegistry.length) return DEFAULT_MODELS;
    return modelRegistry.map((model) => ({
      id: model.model_id,
      label: model.display_name || model.model_id,
      provider: model.provider,
      registryId: model.id,
    }));
  }, [modelRegistry]);

  const selectedPlayground = useMemo(
    () => playgrounds.find((pg) => pg.id === activePlaygroundId) || null,
    [playgrounds, activePlaygroundId]
  );

  const latestRunByVariant = useMemo(() => {
    const map = new Map<string, PlaygroundRun>();
    runs.forEach((run) => {
      if (!map.has(run.variantId)) {
        map.set(run.variantId, run);
      }
    });
    return map;
  }, [runs]);

  const playgroundConfig = useMemo(
    () => ({
      version: 1,
      system_prompt: systemPrompt,
      input,
      messages: messages.map((msg) => ({ role: msg.role, content: msg.content })),
      variants,
    }),
    [systemPrompt, input, messages, variants]
  );

  const currentSignature = useMemo(
    () =>
      JSON.stringify({
        name: playgroundName.trim(),
        description: playgroundDescription.trim(),
        config: playgroundConfig,
      }),
    [playgroundName, playgroundDescription, playgroundConfig]
  );

  const workspaceStatus = useMemo(() => {
    if (savingPlayground) return { label: 'Saving', variant: 'primary' as const };
    if (!activePlaygroundId) return { label: 'Draft', variant: 'neutral' as const };
    if (!savedSignature) return { label: 'Unsaved', variant: 'warning' as const };
    return currentSignature === savedSignature
      ? { label: 'Saved', variant: 'success' as const }
      : { label: 'Unsaved', variant: 'warning' as const };
  }, [savingPlayground, activePlaygroundId, savedSignature, currentSignature]);

  const isDirty = useMemo(
    () => Boolean(activePlaygroundId && savedSignature && currentSignature !== savedSignature),
    [activePlaygroundId, savedSignature, currentSignature]
  );

  const hasModelRegistry = modelRegistry.length > 0;

  const runningCount = useMemo(
    () => runs.filter((run) => run.status === 'running').length,
    [runs]
  );

  const lastRun = runs[0];
  const compareLeft = runs.find((run) => run.id === compareLeftId) || null;
  const compareRight = runs.find((run) => run.id === compareRightId) || null;

  useEffect(() => {
    let isMounted = true;
    if (!projectId) return () => { };
    const load = async () => {
      try {
        const [playgroundData, datasetData, modelData] = await Promise.all([
          api.getPlaygrounds(projectId),
          api.getDatasets(projectId),
          api.getModelRegistry(true),
        ]);
        if (!isMounted) return;
        setPlaygrounds(playgroundData);
        setDatasets(datasetData);
        setModelRegistry(modelData);
      } catch (error) {
        console.error('Failed to load playground data', error);
      }
    };
    load();
    return () => {
      isMounted = false;
    };
  }, [projectId]);

  useEffect(() => {
    setVariants((prev) => prev.map((variant) => normalizeVariant(variant, modelOptions)));
  }, [modelOptions]);

  useEffect(() => {
    if (!snapshotVariantId && variants.length) {
      setSnapshotVariantId(variants[0].id);
    } else if (snapshotVariantId && !variants.some((variant) => variant.id === snapshotVariantId)) {
      setSnapshotVariantId(variants[0]?.id || '');
    }
  }, [variants, snapshotVariantId]);

  useEffect(() => {
    if (snapshotStatus === 'saving') return;
    setSnapshotStatus('idle');
    setSnapshotError(null);
    setSnapshotExperimentId(null);
  }, [snapshotDatasetId, snapshotVariantId, snapshotName]);

  useEffect(() => {
    if (compareTouched) return;
    if (runs.length >= 2) {
      setCompareRightId(runs[0].id);
      setCompareLeftId(runs[1].id);
    } else if (runs.length === 1) {
      setCompareRightId(runs[0].id);
      setCompareLeftId('');
    }
  }, [runs, compareTouched]);

  useEffect(() => {
    if (selectedPlaygroundId === NEW_PLAYGROUND_VALUE) {
      if (activePlaygroundId) {
        handleNewPlayground();
      }
      return;
    }
    const playground = playgrounds.find((pg) => pg.id === selectedPlaygroundId);
    if (!playground) return;
    if (isDirty && playground.id === activePlaygroundId) return;
    applyPlayground(playground);
  }, [selectedPlaygroundId, playgrounds, isDirty, activePlaygroundId]);

  useEffect(() => {
    if (!playgroundName.trim()) return;
    if (!snapshotName) {
      setSnapshotName(`${playgroundName.trim()} snapshot`);
    }
  }, [playgroundName, snapshotName]);

  const applyPlayground = (playground: Playground) => {
    const config = playground.config || {};
    const nextSystem =
      typeof config.system_prompt === 'string'
        ? config.system_prompt
        : typeof config.systemPrompt === 'string'
          ? config.systemPrompt
          : DEFAULT_SYSTEM_PROMPT;
    const nextInput = typeof config.input === 'string' ? config.input : '';
    const nextMessages = Array.isArray(config.messages)
      ? config.messages
        .filter((msg: any) => msg && typeof msg === 'object')
        .map((msg: any) => ({
          id: msg.id || makeId('msg'),
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: typeof msg.content === 'string' ? msg.content : '',
        }))
      : [];
    const nextVariants = Array.isArray(config.variants)
      ? config.variants
        .filter((variant: any) => variant && typeof variant === 'object')
        .map((variant: any) =>
          normalizeVariant(
            {
              id: variant.id || makeId('variant'),
              name: variant.name || 'Variant',
              model: variant.model || DEFAULT_MODELS[0].id,
              provider: variant.provider,
              temperature: Number(variant.temperature ?? DEFAULT_TEMPERATURE),
              top_p: Number(variant.top_p ?? DEFAULT_TOP_P),
              max_tokens:
                variant.max_tokens === null || variant.max_tokens === undefined
                  ? DEFAULT_MAX_TOKENS
                  : Number(variant.max_tokens),
            },
            modelOptions
          )
        )
      : buildDefaultVariants(modelOptions);

    const normalizedVariants = nextVariants.length
      ? nextVariants
      : buildDefaultVariants(modelOptions);

    setActivePlaygroundId(playground.id);
    setPlaygroundName(playground.name || 'Untitled Playground');
    setPlaygroundDescription(playground.description || '');
    setSystemPrompt(nextSystem);
    setInput(nextInput);
    setMessages(nextMessages);
    setVariants(normalizedVariants);
    setShowContext(nextMessages.length > 0);
    setSavedSignature(
      JSON.stringify({
        name: playground.name || 'Untitled Playground',
        description: playground.description || '',
        config: {
          version: 1,
          system_prompt: nextSystem,
          input: nextInput,
          messages: nextMessages.map((msg) => ({ role: msg.role, content: msg.content })),
          variants: normalizedVariants,
        },
      })
    );
    setRuns([]);
    setRunNotice(null);
    setSnapshotStatus('idle');
    setSnapshotError(null);
    setSnapshotExperimentId(null);
  };

  const handleRefreshPlaygrounds = async () => {
    if (!projectId) return;
    try {
      const data = await api.getPlaygrounds(projectId);
      setPlaygrounds(data);
    } catch (error) {
      console.error('Failed to refresh playgrounds', error);
    }
  };

  const handleNewPlayground = () => {
    setSelectedPlaygroundId(NEW_PLAYGROUND_VALUE);
    setActivePlaygroundId(null);
    setPlaygroundName('Untitled Playground');
    setPlaygroundDescription('');
    setSystemPrompt(DEFAULT_SYSTEM_PROMPT);
    setInput('');
    setMessages([]);
    setShowContext(false);
    setVariants(buildDefaultVariants(modelOptions));
    setRuns([]);
    setRunNotice(null);
    setSavedSignature('');
    setSnapshotStatus('idle');
    setSnapshotError(null);
    setSnapshotExperimentId(null);
  };

  const handleSavePlayground = async () => {
    if (!projectId || !playgroundName.trim()) return;
    setSavingPlayground(true);
    setRunNotice(null);
    try {
      const payload = {
        name: playgroundName.trim(),
        description: playgroundDescription.trim() || undefined,
        config: playgroundConfig,
      };
      let saved: Playground;
      if (activePlaygroundId) {
        saved = await api.updatePlayground(activePlaygroundId, payload);
      } else {
        saved = await api.createPlayground({ project_id: projectId, ...payload });
      }
      setActivePlaygroundId(saved.id);
      setSelectedPlaygroundId(saved.id);
      setSavedSignature(currentSignature);
      await handleRefreshPlaygrounds();
    } catch (error: any) {
      setRunNotice(error?.message || 'Failed to save playground');
    } finally {
      setSavingPlayground(false);
    }
  };

  const handleDeletePlayground = async () => {
    if (!activePlaygroundId) return;
    try {
      await api.deletePlayground(activePlaygroundId);
      handleNewPlayground();
      await handleRefreshPlaygrounds();
    } catch (error: any) {
      setRunNotice(error?.message || 'Failed to delete playground');
    }
  };

  const updateVariant = (variantId: string, patch: Partial<PlaygroundVariant>) => {
    setVariants((prev) =>
      prev.map((variant) => (variant.id === variantId ? { ...variant, ...patch } : variant))
    );
  };

  const addVariant = () => {
    const base = modelOptions[0] || DEFAULT_MODELS[0];
    setVariants((prev) => [
      ...prev,
      {
        id: makeId('variant'),
        name: `Variant ${prev.length + 1}`,
        model: base.id,
        provider: base.provider,
        temperature: DEFAULT_TEMPERATURE,
        top_p: DEFAULT_TOP_P,
        max_tokens: DEFAULT_MAX_TOKENS,
      },
    ]);
  };

  const removeVariant = (variantId: string) => {
    if (variants.length <= 1) return;
    const removedRunIds = runs.filter((run) => run.variantId === variantId).map((run) => run.id);
    setVariants((prev) => prev.filter((variant) => variant.id !== variantId));
    setRuns((prev) => prev.filter((run) => run.variantId !== variantId));
    if (removedRunIds.includes(compareLeftId)) setCompareLeftId('');
    if (removedRunIds.includes(compareRightId)) setCompareRightId('');
    if (removedRunIds.includes(compareLeftId) || removedRunIds.includes(compareRightId)) {
      setCompareTouched(false);
    }
  };

  const addMessage = () => {
    setMessages((prev) => [...prev, { id: makeId('msg'), role: 'user', content: '' }]);
    setShowContext(true);
  };

  const updateMessage = (id: string, patch: Partial<Message>) => {
    setMessages((prev) => prev.map((msg) => (msg.id === id ? { ...msg, ...patch } : msg)));
  };

  const removeMessage = (id: string) => {
    setMessages((prev) => prev.filter((msg) => msg.id !== id));
  };

  const addRun = (run: PlaygroundRun) => {
    setRuns((prev) => [run, ...prev].slice(0, MAX_RUNS));
  };

  const updateRun = (runId: string, patch: Partial<PlaygroundRun>) => {
    setRuns((prev) => prev.map((run) => (run.id === runId ? { ...run, ...patch } : run)));
  };

  const handleClearRuns = () => {
    setRuns([]);
    setCompareLeftId('');
    setCompareRightId('');
    setCompareTouched(false);
  };
  const runVariant = async (variant: PlaygroundVariant) => {
    if (!projectId) {
      setRunNotice('Select a project before running.');
      return;
    }
    const traceId = makeId('trace');
    const runId = makeId('run');
    const startedAt = Date.now();

    const run: PlaygroundRun = {
      id: runId,
      variantId: variant.id,
      variantName: variant.name,
      model: variant.model,
      provider: variant.provider,
      status: 'running',
      output: '',
      reasoning: '',
      traceId,
      startedAt,
    };

    addRun(run);
    setRunNotice(null);

    const controller = new AbortController();
    runControllersRef.current[runId] = controller;

    try {
      const response = await fetch(`${API_BASE_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Athena-Project-Id': projectId,
        },
        body: JSON.stringify({
          model: variant.model,
          provider: variant.provider || undefined,
          messages: buildRequestMessages(systemPrompt, messages, input),
          temperature: variant.temperature,
          top_p: variant.top_p,
          max_tokens: variant.max_tokens ?? undefined,
          stream: true,
          trace_id: traceId,
          project_id: projectId,
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error('Streaming request failed');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let content = '';
      let reasoning = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let boundary = buffer.indexOf('\n\n');
        while (boundary !== -1) {
          const chunk = buffer.slice(0, boundary).trim();
          buffer = buffer.slice(boundary + 2);
          boundary = buffer.indexOf('\n\n');

          if (!chunk) continue;
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            const data = line.slice(5).trim();
            if (!data || data === '[DONE]') continue;
            try {
              const json = JSON.parse(data);
              (json.choices || []).forEach((choice: any) => {
                const delta = choice.delta || {};
                if (delta.content) {
                  content += delta.content;
                }
                if (delta.reasoning_content) {
                  reasoning += delta.reasoning_content;
                }
              });
              updateRun(runId, { output: content, reasoning });
            } catch (parseError) {
              console.warn('Failed to parse stream chunk', parseError);
            }
          }
        }
      }

      updateRun(runId, { status: 'success', completedAt: Date.now(), output: content, reasoning });
    } catch (error: any) {
      const aborted = error?.name === 'AbortError';
      updateRun(runId, {
        status: aborted ? 'canceled' : 'error',
        completedAt: Date.now(),
        error: aborted ? 'Canceled' : error?.message || 'Run failed',
      });
      if (!aborted) {
        setRunNotice(error?.message || 'Run failed');
      }
    } finally {
      delete runControllersRef.current[runId];
    }
  };

  const handleRunAll = async () => {
    if (!variants.length || batchRunning) return;
    setBatchRunning(true);
    setRunNotice(null);
    try {
      await Promise.all(variants.map((variant) => runVariant(variant)));
    } finally {
      setBatchRunning(false);
    }
  };

  const handleStopRun = (runId: string) => {
    const controller = runControllersRef.current[runId];
    if (controller) controller.abort();
  };

  const handleStopAll = () => {
    Object.keys(runControllersRef.current).forEach((runId) => handleStopRun(runId));
  };

  const handleUseOutput = (run?: PlaygroundRun) => {
    if (!run?.output) return;
    setInput(run.output);
  };

  const handleAddToContext = (run?: PlaygroundRun) => {
    if (!run?.output) return;
    setMessages((prev) => [...prev, { id: makeId('msg'), role: 'assistant', content: run.output }]);
    setShowContext(true);
  };

  const handleCopyOutput = async (run?: PlaygroundRun) => {
    if (!run?.output || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(run.output);
    } catch (error) {
      console.warn('Failed to copy output', error);
    }
  };

  const handleOpenTrace = async (traceId?: string) => {
    if (!traceId) return;
    setTraceModalOpen(true);
    setTraceError(null);
    setActiveTrace(null);
    const cached = traceCacheRef.current[traceId];
    if (cached) {
      setActiveTrace(cached);
      return;
    }
    setTraceLoading(true);
    try {
      const trace = await api.getTrace(traceId);
      traceCacheRef.current[traceId] = trace;
      setActiveTrace(trace);
    } catch (error: any) {
      setTraceError(error?.message || 'Failed to load trace');
    } finally {
      setTraceLoading(false);
    }
  };

  const handleCloseTrace = () => {
    setTraceModalOpen(false);
    setTraceError(null);
    setActiveTrace(null);
    setTraceLoading(false);
  };

  const handleSnapshot = async () => {
    if (!projectId || !snapshotDatasetId || !snapshotVariantId || !snapshotName.trim()) return;
    setSnapshotStatus('saving');
    setSnapshotError(null);
    setSnapshotExperimentId(null);

    try {
      const variant = variants.find((v) => v.id === snapshotVariantId);
      if (!variant) throw new Error('Select a variant to snapshot');

      const modelRow =
        modelRegistry.find(
          (row) => row.model_id === variant.model && (!variant.provider || row.provider === variant.provider)
        ) || modelRegistry.find((row) => row.model_id === variant.model);
      if (!modelRow) throw new Error('Selected model is not in the registry');

      const experiment = await api.createExperiment({
        project_id: projectId,
        dataset_id: snapshotDatasetId,
        name: snapshotName.trim(),
      });

      await api.createExperimentVersion(experiment.id, {
        model_registry_id: modelRow.id,
        temperature: variant.temperature,
        max_tokens: variant.max_tokens ?? undefined,
        top_p: variant.top_p,
        system_prompt: systemPrompt,
        notes: `Snapshot from playground ${playgroundName}`,
      });

      setSnapshotStatus('success');
      setSnapshotExperimentId(experiment.id);
    } catch (error: any) {
      setSnapshotStatus('error');
      setSnapshotError(error?.message || 'Failed to snapshot experiment');
    }
  };

  const compareDiff = useMemo(() => {
    if (!compareLeft || !compareRight) return [];
    return diffLines(compareLeft.output || '', compareRight.output || '');
  }, [compareLeft, compareRight]);

  const openExperiment = () => {
    if (!snapshotExperimentId) return;
    window.location.hash = `#/experiments?experiment_id=${snapshotExperimentId}`;
  };
  return (
    <div className='flex h-full flex-col'>
      <PageHeader
        title='Playgrounds'
        subtitle='Iterate on prompts, models, and parameters with live traces and fast comparisons.'
        actions={
          <div className='flex items-center gap-2'>
            <Button
              size='sm'
              variant='secondary'
              onClick={handleRunAll}
              disabled={!variants.length || batchRunning || !projectId}
            >
              <PlayIcon className='w-4 h-4' />
              Run all
            </Button>
            <Button
              size='sm'
              variant='ghost'
              onClick={handleStopAll}
              disabled={runningCount === 0}
            >
              <StopIcon className='w-4 h-4' />
              Stop all
            </Button>
          </div>
        }
      />

      <div className='flex-1 overflow-y-auto'>
        <div className='grid grid-cols-1 xl:grid-cols-[320px,1fr] gap-6 px-6 py-6'>
          <aside className='space-y-6'>
            <Card className='space-y-4'>
              <div className='flex items-start justify-between'>
                <div>
                  <div className='flex items-center gap-2'>
                    <h3 className='text-sm font-semibold text-text-main'>Workspace</h3>
                    <Badge variant={workspaceStatus.variant}>{workspaceStatus.label}</Badge>
                  </div>
                  <p className='text-xs text-text-muted mt-1'>
                    Save prompts, variants, and parameters as a reusable workspace.
                  </p>
                </div>
                <IconButton
                  size='sm'
                  variant='ghost'
                  onClick={handleRefreshPlaygrounds}
                  aria-label='Refresh playground list'
                >
                  <ArrowPathIcon className='w-4 h-4' />
                </IconButton>
              </div>

              <div>
                <label className='text-xs text-text-muted font-semibold uppercase tracking-wide'>
                  Saved playgrounds
                </label>
                <Select
                  className='mt-2'
                  value={selectedPlaygroundId}
                  onChange={(event) => setSelectedPlaygroundId(event.target.value)}
                >
                  <option value={NEW_PLAYGROUND_VALUE}>New playground</option>
                  {playgrounds.map((pg) => (
                    <option key={pg.id} value={pg.id}>
                      {pg.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className='grid gap-3'>
                <div>
                  <label className='text-xs text-text-muted font-semibold uppercase tracking-wide'>
                    Playground name
                  </label>
                  <Input
                    className='mt-2'
                    value={playgroundName}
                    onChange={(event) => setPlaygroundName(event.target.value)}
                    placeholder='Playground name'
                  />
                </div>
                <div>
                  <label className='text-xs text-text-muted font-semibold uppercase tracking-wide'>
                    Description
                  </label>
                  <Textarea
                    className='mt-2'
                    value={playgroundDescription}
                    onChange={(event) => setPlaygroundDescription(event.target.value)}
                    placeholder='Optional context for collaborators'
                    rows={3}
                  />
                </div>
              </div>

              <div className='flex flex-wrap gap-2'>
                <Button
                  size='sm'
                  variant='primary'
                  onClick={handleSavePlayground}
                  disabled={savingPlayground || !projectId || !playgroundName.trim()}
                >
                  {savingPlayground ? 'Saving...' : activePlaygroundId ? 'Update' : 'Save'}
                </Button>
                <Button size='sm' variant='secondary' onClick={handleNewPlayground}>
                  New
                </Button>
                <Button
                  size='sm'
                  variant='danger'
                  onClick={handleDeletePlayground}
                  disabled={!activePlaygroundId}
                >
                  Delete
                </Button>
              </div>

              {selectedPlayground && (
                <div className='text-xs text-text-muted'>
                  Last saved {formatTime(selectedPlayground.updated_at)}
                </div>
              )}

              {runNotice && (
                <div className='text-xs text-rose-600 border border-rose-200/40 bg-rose-50/50 rounded-md px-3 py-2'>
                  {runNotice}
                </div>
              )}
            </Card>

            <Card className='space-y-3'>
              <div className='flex items-center justify-between'>
                <div>
                  <h3 className='text-sm font-semibold text-text-main'>Run board</h3>
                  <p className='text-xs text-text-muted mt-1'>
                    Keep track of outputs as you iterate.
                  </p>
                </div>
                <Badge variant={runningCount > 0 ? 'primary' : 'neutral'}>
                  {runningCount > 0 ? 'Running' : 'Idle'}
                </Badge>
              </div>
              <div className='space-y-2'>
                {variants.map((variant) => {
                  const run = latestRunByVariant.get(variant.id);
                  const status = run?.status || 'idle';
                  return (
                    <div key={variant.id} className='flex items-center justify-between text-xs'>
                      <div className='flex flex-col'>
                        <span className='text-text-main font-semibold'>{variant.name}</span>
                        <span className='text-[10px] text-text-muted'>{variant.model}</span>
                      </div>
                      <Badge variant={runStatusVariant(status)}>
                        {status === 'idle'
                          ? 'Idle'
                          : status === 'running'
                            ? 'Streaming'
                            : status === 'success'
                              ? 'Complete'
                              : status === 'canceled'
                                ? 'Canceled'
                                : 'Error'}
                      </Badge>
                    </div>
                  );
                })}
              </div>

              <div className='grid grid-cols-2 gap-3 text-xs text-text-muted'>
                <div>
                  <div className='uppercase tracking-wide font-semibold text-[10px]'>Runs</div>
                  <div className='text-text-main font-semibold text-sm'>{runs.length}</div>
                </div>
                <div>
                  <div className='uppercase tracking-wide font-semibold text-[10px]'>Last run</div>
                  <div className='text-text-main font-semibold text-sm'>
                    {formatTime(lastRun?.startedAt)}
                  </div>
                </div>
                <div>
                  <div className='uppercase tracking-wide font-semibold text-[10px]'>Duration</div>
                  <div className='text-text-main font-semibold text-sm'>
                    {lastRun ? formatDuration(lastRun.startedAt, lastRun.completedAt) : '-'}
                  </div>
                </div>
                <div>
                  <div className='uppercase tracking-wide font-semibold text-[10px]'>Trace</div>
                  <div className='text-text-main font-semibold text-sm'>
                    {formatShortId(lastRun?.traceId)}
                  </div>
                </div>
              </div>

              <Button size='sm' variant='ghost' onClick={handleClearRuns} disabled={!runs.length}>
                Clear run history
              </Button>
            </Card>

            <Card className='space-y-4'>
              <div>
                <h3 className='text-sm font-semibold text-text-main'>Snapshot to Experiment</h3>
                <p className='text-xs text-text-muted mt-1'>
                  Convert the current playground into an experiment version.
                </p>
              </div>

              <div className='grid gap-3'>
                <div>
                  <label className='text-xs text-text-muted font-semibold uppercase tracking-wide'>
                    Dataset
                  </label>
                  <Select
                    className='mt-2'
                    value={snapshotDatasetId}
                    onChange={(event) => setSnapshotDatasetId(event.target.value)}
                  >
                    <option value=''>Select dataset</option>
                    {datasets.map((dataset) => (
                      <option key={dataset.id} value={dataset.id}>
                        {dataset.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className='text-xs text-text-muted font-semibold uppercase tracking-wide'>
                    Variant
                  </label>
                  <Select
                    className='mt-2'
                    value={snapshotVariantId}
                    onChange={(event) => setSnapshotVariantId(event.target.value)}
                  >
                    {variants.map((variant) => (
                      <option key={variant.id} value={variant.id}>
                        {variant.name} ({variant.model})
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className='text-xs text-text-muted font-semibold uppercase tracking-wide'>
                    Experiment name
                  </label>
                  <Input
                    className='mt-2'
                    value={snapshotName}
                    onChange={(event) => setSnapshotName(event.target.value)}
                    placeholder='Name your experiment'
                  />
                </div>
              </div>

              {!hasModelRegistry && (
                <div className='text-xs text-amber-700 border border-amber-200/40 bg-amber-50/40 rounded-md px-3 py-2'>
                  Model registry is empty. Sync models in Settings before snapshotting.
                </div>
              )}

              <Button
                size='sm'
                variant='primary'
                onClick={handleSnapshot}
                disabled={
                  snapshotStatus === 'saving' ||
                  !hasModelRegistry ||
                  !snapshotDatasetId ||
                  !snapshotVariantId ||
                  !snapshotName.trim()
                }
              >
                {snapshotStatus === 'saving' ? 'Saving...' : 'Snapshot'}
              </Button>

              {snapshotError && (
                <div className='text-xs text-rose-600 border border-rose-200/40 bg-rose-50/50 rounded-md px-3 py-2'>
                  {snapshotError}
                </div>
              )}

              {snapshotStatus === 'success' && (
                <div className='text-xs text-emerald-600 border border-emerald-200/40 bg-emerald-50/40 rounded-md px-3 py-2'>
                  Snapshot created. Ready to run an experiment.
                </div>
              )}

              {snapshotExperimentId && (
                <Button size='sm' variant='ghost' onClick={openExperiment}>
                  Open experiment
                  <ArrowTopRightOnSquareIcon className='w-4 h-4' />
                </Button>
              )}
            </Card>
          </aside>
          <main className='space-y-6'>
            <Card className='space-y-4'>
              <div className='flex items-start justify-between'>
                <div>
                  <h3 className='text-sm font-semibold text-text-main'>Prompt</h3>
                  <p className='text-xs text-text-muted mt-1'>
                    Define the system instruction and current user input.
                  </p>
                </div>
                <Button
                  size='sm'
                  variant='ghost'
                  onClick={() => setShowContext((prev) => !prev)}
                >
                  {showContext
                    ? 'Hide context'
                    : messages.length
                      ? `Show context (${messages.length})`
                      : 'Show context'}
                  {showContext ? (
                    <ChevronUpIcon className='w-4 h-4' />
                  ) : (
                    <ChevronDownIcon className='w-4 h-4' />
                  )}
                </Button>
              </div>

              <div>
                <label className='text-xs text-text-muted font-semibold uppercase tracking-wide'>
                  System prompt
                </label>
                <Textarea
                  className='mt-2'
                  value={systemPrompt}
                  onChange={(event) => setSystemPrompt(event.target.value)}
                  rows={4}
                />
              </div>

              {showContext && (
                <div className='border border-border-base rounded-lg bg-app p-4 space-y-3'>
                  <div className='flex items-center justify-between'>
                    <div>
                      <div className='text-xs uppercase tracking-wide font-semibold text-text-muted'>
                        Context messages
                      </div>
                      <div className='text-xs text-text-muted mt-1'>
                        Add optional dialogue context before the current input.
                      </div>
                    </div>
                    <div className='flex items-center gap-2'>
                      <Button size='sm' variant='secondary' onClick={addMessage}>
                        <PlusIcon className='w-4 h-4' />
                        Add
                      </Button>
                      <Button
                        size='sm'
                        variant='ghost'
                        onClick={() => setMessages([])}
                        disabled={!messages.length}
                      >
                        Clear
                      </Button>
                    </div>
                  </div>

                  {messages.length === 0 && (
                    <div className='text-xs text-text-muted'>No context added yet.</div>
                  )}

                  {messages.map((msg) => (
                    <div key={msg.id} className='grid grid-cols-[120px,1fr,40px] gap-2'>
                      <Select
                        value={msg.role}
                        onChange={(event) =>
                          updateMessage(msg.id, { role: event.target.value as MessageRole })
                        }
                      >
                        <option value='user'>User</option>
                        <option value='assistant'>Assistant</option>
                      </Select>
                      <Textarea
                        value={msg.content}
                        onChange={(event) => updateMessage(msg.id, { content: event.target.value })}
                        rows={2}
                      />
                      <IconButton
                        size='sm'
                        variant='ghost'
                        onClick={() => removeMessage(msg.id)}
                        aria-label='Remove message'
                      >
                        <XMarkIcon className='w-4 h-4' />
                      </IconButton>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <label className='text-xs text-text-muted font-semibold uppercase tracking-wide'>
                  User input
                </label>
                <Textarea
                  className='mt-2'
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  rows={4}
                  placeholder='Ask a question or add a new user prompt...'
                />
              </div>
            </Card>

            <Card className='space-y-4'>
              <div className='flex items-start justify-between gap-4'>
                <div>
                  <h3 className='text-sm font-semibold text-text-main'>Variants</h3>
                  <p className='text-xs text-text-muted mt-1'>
                    Compare models side by side with their own parameters.
                  </p>
                </div>
                <div className='flex items-center gap-2'>
                  <Button size='sm' variant='secondary' onClick={addVariant}>
                    <PlusIcon className='w-4 h-4' />
                    Add variant
                  </Button>
                </div>
              </div>

              <div className='grid grid-cols-1 xl:grid-cols-2 gap-4'>
                {variants.map((variant) => {
                  const run = latestRunByVariant.get(variant.id);
                  const status = run?.status || 'idle';
                  return (
                    <div
                      key={variant.id}
                      className='rounded-lg border border-border-base bg-app p-4 space-y-4'
                    >
                      <div className='flex items-start justify-between gap-3'>
                        <div className='flex-1 space-y-2'>
                          <Input
                            value={variant.name}
                            onChange={(event) => updateVariant(variant.id, { name: event.target.value })}
                            className='text-sm font-semibold'
                          />
                          <Badge variant={runStatusVariant(status)}>
                            {status === 'idle'
                              ? 'Idle'
                              : status === 'running'
                                ? 'Streaming'
                                : status === 'success'
                                  ? 'Complete'
                                  : status === 'canceled'
                                    ? 'Canceled'
                                    : 'Error'}
                          </Badge>
                        </div>
                        <div className='flex items-center gap-2'>
                          {status === 'running' ? (
                            <Button
                              size='sm'
                              variant='ghost'
                              onClick={() => run && handleStopRun(run.id)}
                            >
                              <StopIcon className='w-4 h-4' />
                              Stop
                            </Button>
                          ) : (
                            <Button size='sm' variant='primary' onClick={() => runVariant(variant)}>
                              <PlayIcon className='w-4 h-4' />
                              Run
                            </Button>
                          )}
                          <IconButton
                            size='sm'
                            variant='ghost'
                            onClick={() => removeVariant(variant.id)}
                            disabled={variants.length <= 1}
                            aria-label='Remove variant'
                          >
                            <XMarkIcon className='w-4 h-4' />
                          </IconButton>
                        </div>
                      </div>

                      <div className='grid gap-3'>
                        <div>
                          <label className='text-xs text-text-muted font-semibold uppercase tracking-wide'>
                            Model
                          </label>
                          <Select
                            className='mt-2'
                            value={variant.model}
                            onChange={(event) => {
                              const model = event.target.value;
                              const match = modelOptions.find((opt) => opt.id === model);
                              updateVariant(variant.id, { model, provider: match?.provider });
                            }}
                          >
                            {modelOptions.map((model) => (
                              <option key={model.id} value={model.id}>
                                {model.label}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <div className='flex items-center justify-between text-xs text-text-muted'>
                          <span>Provider</span>
                          <Badge variant='neutral'>{getProviderLabel(variant.provider)}</Badge>
                        </div>
                      </div>

                      <div className='grid grid-cols-3 gap-3'>
                        <div>
                          <label className='text-[10px] text-text-muted uppercase tracking-wide font-semibold'>
                            Temperature
                          </label>
                          <Input
                            className='mt-2'
                            type='number'
                            step='0.1'
                            min='0'
                            max='2'
                            value={variant.temperature}
                            onChange={(event) =>
                              updateVariant(variant.id, {
                                temperature: Number(event.target.value || 0),
                              })
                            }
                          />
                        </div>
                        <div>
                          <label className='text-[10px] text-text-muted uppercase tracking-wide font-semibold'>
                            Top P
                          </label>
                          <Input
                            className='mt-2'
                            type='number'
                            step='0.1'
                            min='0'
                            max='1'
                            value={variant.top_p}
                            onChange={(event) =>
                              updateVariant(variant.id, { top_p: Number(event.target.value || 0) })
                            }
                          />
                        </div>
                        <div>
                          <label className='text-[10px] text-text-muted uppercase tracking-wide font-semibold'>
                            Max tokens
                          </label>
                          <Input
                            className='mt-2'
                            type='number'
                            min='1'
                            value={variant.max_tokens ?? ''}
                            onChange={(event) =>
                              updateVariant(variant.id, {
                                max_tokens: event.target.value
                                  ? Number(event.target.value)
                                  : null,
                              })
                            }
                          />
                        </div>
                      </div>

                      <div className='space-y-3'>
                        <div className='flex items-center justify-between'>
                          <div className='text-xs text-text-muted font-semibold uppercase tracking-wide'>
                            Output
                          </div>
                          {run && (
                            <div className='flex items-center gap-3 text-xs text-text-muted'>
                              <span>{formatTime(run.completedAt || run.startedAt)}</span>
                              <span>{formatDuration(run.startedAt, run.completedAt)}</span>
                            </div>
                          )}
                        </div>
                        <div className='border border-border-base bg-panel rounded-md p-3 text-xs text-text-main whitespace-pre-wrap min-h-[90px] max-h-60 overflow-y-auto pr-2'>
                          {run?.output || 'No output yet.'}
                        </div>
                        <div className='flex flex-wrap items-center gap-2 text-xs'>
                          <Button
                            size='sm'
                            variant='ghost'
                            onClick={() => handleUseOutput(run)}
                            disabled={!run?.output}
                          >
                            Use as input
                          </Button>
                          <Button
                            size='sm'
                            variant='ghost'
                            onClick={() => handleAddToContext(run)}
                            disabled={!run?.output}
                          >
                            Add to context
                          </Button>
                          <Button
                            size='sm'
                            variant='ghost'
                            onClick={() => handleCopyOutput(run)}
                            disabled={!run?.output}
                          >
                            Copy output
                          </Button>
                        </div>

                        {run?.reasoning && (
                          <div className='border border-amber-200/40 bg-amber-50/40 rounded-md p-3 text-xs text-amber-800 whitespace-pre-wrap max-h-48 overflow-y-auto pr-2'>
                            <div className='text-[10px] uppercase tracking-wide font-semibold mb-2'>
                              Reasoning
                            </div>
                            {run.reasoning}
                          </div>
                        )}

                        {run?.error && (
                          <div className='border border-rose-200/40 bg-rose-50/40 rounded-md p-3 text-xs text-rose-700 whitespace-pre-wrap'>
                            {run.error}
                          </div>
                        )}
                      </div>

                      <div className='flex flex-wrap items-center justify-between gap-2 text-xs'>
                        <div className='flex items-center gap-2 text-text-muted'>
                          <span>Trace</span>
                          <span className='text-text-main font-medium'>{formatShortId(run?.traceId)}</span>
                        </div>
                        <div className='flex items-center gap-2'>
                          <Button
                            size='sm'
                            variant={compareLeftId === run?.id ? 'primary' : 'outline'}
                            onClick={() => {
                              if (!run) return;
                              setCompareTouched(true);
                              setCompareLeftId(run.id);
                            }}
                            disabled={!run}
                          >
                            Left
                          </Button>
                          <Button
                            size='sm'
                            variant={compareRightId === run?.id ? 'primary' : 'outline'}
                            onClick={() => {
                              if (!run) return;
                              setCompareTouched(true);
                              setCompareRightId(run.id);
                            }}
                            disabled={!run}
                          >
                            Right
                          </Button>
                          <Button
                            size='sm'
                            variant='ghost'
                            onClick={() => handleOpenTrace(run?.traceId)}
                            disabled={!run?.traceId}
                          >
                            Trace
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card className='space-y-4'>
              <div className='flex flex-wrap items-center justify-between gap-4'>
                <div>
                  <h3 className='text-sm font-semibold text-text-main'>Compare</h3>
                  <p className='text-xs text-text-muted mt-1'>
                    Diff two runs to see exactly what changed.
                  </p>
                </div>
                <Tabs
                  value={compareMode}
                  onChange={(value) => setCompareMode(value as 'diff' | 'side')}
                  options={[
                    { id: 'diff', label: 'Diff' },
                    { id: 'side', label: 'Side by side' },
                  ]}
                />
              </div>

              <div className='grid grid-cols-1 lg:grid-cols-2 gap-3'>
                <div>
                  <label className='text-xs text-text-muted font-semibold uppercase tracking-wide'>
                    Left run
                  </label>
                  <Select
                    className='mt-2'
                    value={compareLeftId}
                    onChange={(event) => {
                      setCompareTouched(true);
                      setCompareLeftId(event.target.value);
                    }}
                  >
                    <option value=''>Select run</option>
                    {runs.map((run) => (
                      <option key={run.id} value={run.id}>
                        {run.variantName} | {run.model} | {formatTime(run.startedAt)}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className='text-xs text-text-muted font-semibold uppercase tracking-wide'>
                    Right run
                  </label>
                  <Select
                    className='mt-2'
                    value={compareRightId}
                    onChange={(event) => {
                      setCompareTouched(true);
                      setCompareRightId(event.target.value);
                    }}
                  >
                    <option value=''>Select run</option>
                    {runs.map((run) => (
                      <option key={run.id} value={run.id}>
                        {run.variantName} | {run.model} | {formatTime(run.startedAt)}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              {!compareLeft || !compareRight ? (
                <div className='text-xs text-text-muted border border-border-base bg-panel rounded-md p-4'>
                  Select two runs to compare output changes.
                </div>
              ) : compareMode === 'diff' ? (
                <div className='border border-border-base bg-panel rounded-md p-4 text-xs font-mono'>
                  {compareDiff.length === 0 ? (
                    <div className='text-text-muted'>No differences detected.</div>
                  ) : (
                    compareDiff.map((chunk, index) => (
                      <div
                        key={`${chunk.type}-${index}`}
                        className={cx(
                          'whitespace-pre-wrap leading-relaxed px-2 py-0.5 rounded-sm',
                          chunk.type === 'add' && 'bg-emerald-500/10 text-emerald-700',
                          chunk.type === 'del' && 'bg-rose-500/10 text-rose-700',
                          chunk.type === 'same' && 'text-text-main'
                        )}
                      >
                        <span className='mr-2 text-text-muted'>
                          {chunk.type === 'add' ? '+' : chunk.type === 'del' ? '-' : ' '}
                        </span>
                        {chunk.text || ' '}
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className='grid grid-cols-1 lg:grid-cols-2 gap-4'>
                  <div className='border border-border-base bg-panel rounded-md p-4 text-xs whitespace-pre-wrap'>
                    {compareLeft.output || '-'}
                  </div>
                  <div className='border border-border-base bg-panel rounded-md p-4 text-xs whitespace-pre-wrap'>
                    {compareRight.output || '-'}
                  </div>
                </div>
              )}

              {compareLeft && compareRight && (
                <div className='flex items-center gap-2 text-xs text-text-muted'>
                  <ArrowsRightLeftIcon className='w-4 h-4' />
                  {compareLeft.variantName} vs {compareRight.variantName}
                </div>
              )}
            </Card>
          </main>
        </div>
      </div>

      {traceModalOpen && (
        <div className='fixed inset-0 z-50 bg-black/40 backdrop-blur-sm p-4' onClick={handleCloseTrace}>
          <div
            className='absolute inset-4 rounded-xl border border-border-base bg-panel shadow-lg overflow-hidden'
            onClick={(event) => event.stopPropagation()}
          >
            {traceLoading && (
              <div className='h-full w-full flex items-center justify-center text-text-muted'>
                Loading trace...
              </div>
            )}
            {traceError && (
              <div className='h-full w-full flex items-center justify-center text-rose-600'>
                {traceError}
              </div>
            )}
            {!traceLoading && !traceError && activeTrace && (
              <TraceDetail trace={activeTrace} onClose={handleCloseTrace} />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Labs;
