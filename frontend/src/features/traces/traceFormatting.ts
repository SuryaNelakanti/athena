import type { Span } from '../../types';

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Extract readable output from span
export const extractSpanOutput = (span: Span): string => {
    const output = span.output;
    if (typeof output === 'string') return output;
    if (!output || typeof output !== 'object') return '';
    if (isRecord(output)) {
        for (const key of ['output_text', 'text', 'content', 'value', 'response', 'answer']) {
            if (typeof output[key] === 'string') return output[key];
        }
    }
    return JSON.stringify(output);
};

export const extractSpanReasoning = (span: Span): string | null => {
    const output = isRecord(span.output) ? span.output : {};
    const candidates = [span.attributes.reasoning_content, output.athena_reasoning, output.reasoning];
    return candidates.find((candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0) ?? null;
};

export const extractSpanInput = (span: Span): string => {
    const input = span.input;
    if (typeof input === 'string') return input;
    if (!input || typeof input !== 'object') return '';
    if (isRecord(input)) {
        for (const key of ['prompt', 'input', 'text', 'query', 'question', 'content']) {
            if (typeof input[key] === 'string') return input[key];
        }
        if (Array.isArray(input.messages)) {
            const messages: unknown[] = input.messages;
            const userMessage = messages.find(
                (message) => isRecord(message) && message.role === 'user' && typeof message.content === 'string'
            );
            if (isRecord(userMessage) && typeof userMessage.content === 'string') return userMessage.content;
        }
    }
    return JSON.stringify(input);
};

export const truncateText = (value: string, maxLength: number = 180) => {
    if (!value) return '';
    if (value.length <= maxLength) return value;
    return `${value.slice(0, maxLength).trimEnd()}...`;
};

export const formatTraceId = (value?: string | null) => {
    if (!value) return 'unknown';
    if (value.length <= 12) return value;
    return `${value.slice(0, 8)}...${value.slice(-4)}`;
};

export const formatTraceTime = (value?: number | null) => {
    if (!value) return 'Unknown time';
    return new Date(value).toLocaleString();
};

export const statusVariant = (status?: string | null): 'neutral' | 'success' | 'danger' => {
    if (!status) return 'neutral';
    return status === 'error' ? 'danger' : 'success';
};
