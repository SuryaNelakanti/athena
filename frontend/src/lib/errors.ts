function hasMessage(value: unknown): value is { message: string } {
  return typeof value === 'object'
    && value !== null
    && 'message' in value
    && typeof value.message === 'string';
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message || fallback;
  if (hasMessage(error)) return error.message || fallback;
  return fallback;
}

export function isAbortError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'name' in error
    && error.name === 'AbortError';
}
