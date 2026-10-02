export const formatSessionRelativeTime = (value?: number | null) => {
  if (!value) return '--';
  const date = new Date(value);
  const diff = Date.now() - date.getTime();

  if (diff < 60 * 1000) return 'Just now';
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))}m ago`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))}h ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export const formatSessionDuration = (start?: number, end?: number | null) => {
  if (!start || !end) return '--';
  const delta = Math.max(end - start, 0);
  if (delta < 1000) return `${delta}ms`;
  if (delta < 60 * 1000) return `${(delta / 1000).toFixed(1)}s`;
  return `${Math.floor(delta / 60000)}m ${Math.floor((delta % 60000) / 1000)}s`;
};

export const formatSessionEventType = (value: string) => value
  .split('_')
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  .join(' ');

export const sessionStatusVariant = (status: string): 'neutral' | 'primary' | 'success' | 'warning' | 'danger' => {
  switch (status) {
    case 'error': return 'danger';
    case 'active': return 'primary';
    case 'completed':
    case 'resolved': return 'success';
    case 'open': return 'warning';
    default: return 'neutral';
  }
};
