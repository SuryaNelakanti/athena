import React from 'react';
import { cx } from './utils';

type BadgeVariant = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variants: Record<BadgeVariant, string> = {
  neutral: 'border-border-base text-text-muted bg-panel',
  primary: 'border-primary/20 text-primary bg-primary/10',
  success: 'border-emerald-500/20 text-emerald-600 bg-emerald-500/10',
  warning: 'border-amber-500/20 text-amber-600 bg-amber-500/10',
  danger: 'border-rose-500/20 text-rose-600 bg-rose-500/10',
};

export const Badge: React.FC<BadgeProps> = ({ className, variant = 'neutral', ...props }) => (
  <span
    className={cx(
      'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
      variants[variant],
      className
    )}
    {...props}
  />
);
