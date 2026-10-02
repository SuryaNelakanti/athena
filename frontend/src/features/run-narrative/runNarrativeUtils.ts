export const statusVariant = (status: string): 'neutral' | 'primary' | 'success' | 'warning' | 'danger' => {
    switch (status) {
        case 'error': return 'danger';
        case 'active':
        case 'running': return 'primary';
        case 'completed':
        case 'success': return 'success';
        default: return 'neutral';
    }
};

export const stringList = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
