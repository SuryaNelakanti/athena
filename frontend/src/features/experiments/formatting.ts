export function formatDateTime(ms?: number | null): string {
  return ms ? new Date(ms).toLocaleString() : '-';
}

export function formatNumber(value?: number | null, digits = 0): string {
  return value === undefined || value === null || Number.isNaN(value)
    ? '-'
    : value.toFixed(digits);
}

export function formatPercent(value?: number | null, digits = 0): string {
  return value === undefined || value === null || Number.isNaN(value)
    ? '-'
    : `${(value * 100).toFixed(digits)}%`;
}
