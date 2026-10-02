const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const asRecord = (value: unknown): Record<string, unknown> | null => isRecord(value) ? value : null;

const firstTextField = (record: Record<string, unknown>, fields: string[]): string | null => {
  for (const field of fields) {
    const value = record[field];
    if (typeof value === 'string') return value;
  }
  return null;
};

export function extractText(value: unknown): string {
  if (typeof value === 'string') return value;
  const record = asRecord(value);
  if (!record) return '';
  const direct = firstTextField(record, ['prompt', 'input', 'text', 'query', 'question', 'content']);
  if (direct !== null) return direct;
  if (Array.isArray(record.messages)) {
    const userMessage = record.messages
      .map(asRecord)
      .find((message) => message?.role === 'user');
    if (typeof userMessage?.content === 'string' && userMessage.content) return userMessage.content;
  }
  return JSON.stringify(value) ?? '';
}

export function extractExpected(value: unknown): string {
  if (typeof value === 'string') return value;
  const record = asRecord(value);
  if (!record) return '';
  return firstTextField(record, ['answer', 'expected', 'text', 'content', 'response'])
    ?? JSON.stringify(value)
    ?? '';
}

export function extractOutputText(value: unknown): string {
  if (typeof value === 'string') return value;
  const record = asRecord(value);
  if (!record) return '';
  const direct = firstTextField(record, ['output_text', 'text', 'content']);
  if (direct !== null) return direct;
  if (Array.isArray(record.choices) && record.choices.length > 0) {
    const choice = asRecord(record.choices[0]);
    const message = asRecord(choice?.message);
    if (typeof message?.content === 'string') return message.content;
  }
  return JSON.stringify(value) ?? '';
}
