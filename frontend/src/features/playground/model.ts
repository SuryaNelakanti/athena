export type MessageRole = 'user' | 'assistant';

export type Message = {
  id: string;
  role: MessageRole;
  content: string;
};

export type ModelOption = {
  id: string;
  label: string;
  provider?: string;
  registryId?: string;
};

export type SnapshotStatus = 'idle' | 'saving' | 'success' | 'error';
export type RunStatus = 'idle' | 'running' | 'success' | 'error' | 'canceled';

export type PlaygroundVariant = {
  id: string;
  name: string;
  model: string;
  provider?: string;
  temperature: number;
  top_p: number;
  max_tokens: number | null;
};

export type PlaygroundRun = {
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

export type PlaygroundConfig = {
  version: 1;
  system_prompt: string;
  input: string;
  messages: Array<Pick<Message, 'role' | 'content'>>;
  variants: PlaygroundVariant[];
};

export type DecodedPlaygroundConfig = {
  systemPrompt: string;
  input: string;
  messages: Message[];
  variants: PlaygroundVariant[];
};

export type DiffChunk = { type: 'same' | 'add' | 'del'; text: string };
export type StreamTextDelta = { content?: string; reasoningContent?: string };

export const DEFAULT_SYSTEM_PROMPT =
  'You are Athena Playground. Be concise, explicit about assumptions, and show your work when asked.';
export const DEFAULT_TEMPERATURE = 0.7;
export const DEFAULT_TOP_P = 1;
export const DEFAULT_MAX_TOKENS = 512;
export const NEW_PLAYGROUND_VALUE = '__new__';
export const MAX_RUNS = 40;

export const DEFAULT_MODELS: ModelOption[] = [
  { id: 'gpt-4o-mini', label: 'GPT-4o Mini', provider: 'openai' },
  { id: 'claude-3-5-sonnet-20240620', label: 'Claude 3.5 Sonnet', provider: 'anthropic' },
  { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', provider: 'gemini' },
  { id: 'mock-model-v1', label: 'Mock Model v1', provider: 'mock' },
];

export const makeId = (prefix: string) => {
  const seed =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${seed}`;
};

export const formatTime = (value?: number) => {
  if (!value) return '-';
  return new Date(value).toLocaleTimeString();
};

export const formatDuration = (start?: number, end?: number) => {
  if (!start) return '-';
  const stop = end || Date.now();
  const delta = Math.max(stop - start, 0);
  if (delta >= 1000) return `${(delta / 1000).toFixed(1)}s`;
  return `${delta}ms`;
};

export const formatShortId = (value?: string) => {
  if (!value) return '-';
  return value.slice(0, 8);
};

export const getProviderLabel = (provider?: string) => {
  if (!provider) return 'Auto';
  if (provider === 'openai') return 'OpenAI';
  if (provider === 'anthropic') return 'Anthropic';
  if (provider === 'gemini') return 'Gemini';
  if (provider === 'mock') return 'Mock';
  return provider;
};

export const runStatusVariant = (status: RunStatus) => {
  if (status === 'running') return 'primary';
  if (status === 'success') return 'success';
  if (status === 'error') return 'danger';
  if (status === 'canceled') return 'warning';
  return 'neutral';
};

export const normalizeVariant = (variant: PlaygroundVariant, options: ModelOption[]) => {
  const available = options.length ? options : DEFAULT_MODELS;
  const match = available.find((model) => model.id === variant.model) || available[0];
  return {
    ...variant,
    model: match?.id || variant.model,
    provider: match?.provider || variant.provider,
    temperature: Number.isFinite(variant.temperature) ? variant.temperature : DEFAULT_TEMPERATURE,
    top_p: Number.isFinite(variant.top_p) ? variant.top_p : DEFAULT_TOP_P,
    max_tokens: variant.max_tokens ?? DEFAULT_MAX_TOKENS,
  };
};

export const buildDefaultVariants = (options: ModelOption[]) => {
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

export const buildRequestMessages = (systemPrompt: string, messages: Message[], input: string) => {
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

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

export const extractPlaygroundTextDeltas = (event: unknown): StreamTextDelta[] => {
  const payload = asRecord(event);
  if (!payload || !Array.isArray(payload.choices)) return [];

  const choices: unknown[] = payload.choices;
  return choices.flatMap((choiceValue): StreamTextDelta[] => {
    const choice = asRecord(choiceValue);
    const delta = asRecord(choice?.delta);
    if (!delta) return [];

    const content = typeof delta.content === 'string' ? delta.content : undefined;
    const reasoningContent =
      typeof delta.reasoning_content === 'string' ? delta.reasoning_content : undefined;
    if (content === undefined && reasoningContent === undefined) return [];

    return [{ content, reasoningContent }];
  });
};

const readNonEmptyString = (value: unknown, fallback: string) =>
  typeof value === 'string' && value.length > 0 ? value : fallback;

export const decodePlaygroundConfig = (
  value: unknown,
  modelOptions: ModelOption[]
): DecodedPlaygroundConfig => {
  const config = asRecord(value) || {};
  const systemPrompt =
    typeof config.system_prompt === 'string'
      ? config.system_prompt
      : typeof config.systemPrompt === 'string'
        ? config.systemPrompt
        : DEFAULT_SYSTEM_PROMPT;
  const input = typeof config.input === 'string' ? config.input : '';
  const messages = Array.isArray(config.messages)
    ? config.messages.flatMap((value): Message[] => {
        const message = asRecord(value);
        if (!message) return [];
        return [{
          id: readNonEmptyString(message.id, makeId('msg')),
          role: message.role === 'assistant' ? 'assistant' : 'user',
          content: typeof message.content === 'string' ? message.content : '',
        }];
      })
    : [];
  const variants = Array.isArray(config.variants)
    ? config.variants.flatMap((value): PlaygroundVariant[] => {
        const variant = asRecord(value);
        if (!variant) return [];
        return [
          normalizeVariant(
            {
              id: readNonEmptyString(variant.id, makeId('variant')),
              name: readNonEmptyString(variant.name, 'Variant'),
              model: readNonEmptyString(variant.model, DEFAULT_MODELS[0].id),
              provider: typeof variant.provider === 'string' ? variant.provider : undefined,
              temperature: Number(variant.temperature ?? DEFAULT_TEMPERATURE),
              top_p: Number(variant.top_p ?? DEFAULT_TOP_P),
              max_tokens:
                variant.max_tokens === null || variant.max_tokens === undefined
                  ? DEFAULT_MAX_TOKENS
                  : Number(variant.max_tokens),
            },
            modelOptions
          ),
        ];
      })
    : [];

  return {
    systemPrompt,
    input,
    messages,
    variants: variants.length ? variants : buildDefaultVariants(modelOptions),
  };
};

export const buildPlaygroundConfig = (
  systemPrompt: string,
  input: string,
  messages: Message[],
  variants: PlaygroundVariant[]
): PlaygroundConfig => ({
  version: 1,
  system_prompt: systemPrompt,
  input,
  messages: messages.map(({ role, content }) => ({ role, content })),
  variants,
});

// Simple LCS diff for line comparisons without external dependencies.
export const diffLines = (before: string, after: string): DiffChunk[] => {
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
