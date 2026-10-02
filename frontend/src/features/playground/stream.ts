import { API_BASE_URL } from '../../lib/api';
import { extractPlaygroundTextDeltas } from './model';
import type { PlaygroundVariant } from './model';

export interface PlaygroundRequestMessage {
  role: string;
  content: string;
}

export interface PlaygroundStreamOptions {
  projectId: string;
  variant: PlaygroundVariant;
  messages: PlaygroundRequestMessage[];
  traceId: string;
  signal: AbortSignal;
  onUpdate?: (output: string, reasoning: string) => void;
}

export interface PlaygroundStreamResult {
  output: string;
  reasoning: string;
}

export const streamPlaygroundChat = async ({
  projectId,
  variant,
  messages,
  traceId,
  signal,
  onUpdate,
}: PlaygroundStreamOptions): Promise<PlaygroundStreamResult> => {
  const response = await fetch(`${API_BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Athena-Project-Id': projectId,
    },
    body: JSON.stringify({
      model: variant.model,
      provider: variant.provider || undefined,
      messages,
      temperature: variant.temperature,
      top_p: variant.top_p,
      max_tokens: variant.max_tokens ?? undefined,
      stream: true,
      trace_id: traceId,
      project_id: projectId,
    }),
    signal,
  });

  if (!response.ok || !response.body) {
    throw new Error('Streaming request failed');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let output = '';
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

      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;

        try {
          const event: unknown = JSON.parse(data);
          for (const delta of extractPlaygroundTextDeltas(event)) {
            output += delta.content ?? '';
            reasoning += delta.reasoningContent ?? '';
          }
          onUpdate?.(output, reasoning);
        } catch (parseError) {
          console.warn('Failed to parse stream chunk', parseError);
        }
      }
    }
  }

  return { output, reasoning };
};
