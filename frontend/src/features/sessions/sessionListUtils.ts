export const formatSessionTimestamp = (value?: number | null) => {
  if (!value) return '--';
  const date = new Date(value);
  const diff = Date.now() - date.getTime();

  if (diff < 24 * 60 * 60 * 1000) {
    const hours = Math.floor(diff / (60 * 60 * 1000));
    const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
    if (hours > 0) return `${hours}h ${minutes}m ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  }

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const getSessionStatusVariant = (
  status: string,
): 'neutral' | 'primary' | 'success' | 'warning' | 'danger' => {
  switch (status) {
    case 'error':
      return 'danger';
    case 'active':
      return 'primary';
    case 'completed':
      return 'success';
    default:
      return 'neutral';
  }
};
