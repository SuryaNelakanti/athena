import React from 'react';
import { cx } from './utils';

export interface TabOption {
  id: string;
  label: string;
}

interface TabsProps {
  options: TabOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({ options, value, onChange, className }) => (
  <div className={cx('inline-flex rounded-md border border-border-base bg-panel p-1', className)}>
    {options.map((option) => {
      const active = option.id === value;
      return (
        <button
          key={option.id}
          onClick={() => onChange(option.id)}
          className={cx(
            'px-3 py-1.5 text-xs font-medium transition',
            active
              ? 'rounded-md bg-primary/10 text-primary'
              : 'rounded-md text-text-muted hover:text-text-main'
          )}
        >
          {option.label}
        </button>
      );
    })}
  </div>
);
