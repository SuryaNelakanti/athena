export const reviewStatusVariant = (status: string): 'neutral' | 'primary' | 'success' | 'warning' | 'danger' => {
  switch (status) {
    case 'open': return 'warning';
    case 'in_review': return 'primary';
    case 'resolved': return 'success';
    case 'dismissed': return 'danger';
    default: return 'neutral';
  }
};
