import React from 'react';
import { cx } from './utils';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  subtitle,
  actions,
  className,
}) => (
  <div className={cx('flex items-start justify-between gap-4', className)}>
    <div>
      <h1 className="text-2xl font-semibold text-text-main tracking-tight">{title}</h1>
      {subtitle ? <p className="text-sm text-text-muted mt-1">{subtitle}</p> : null}
    </div>
    {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
  </div>
);
