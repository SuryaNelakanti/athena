import React from 'react';
import { cx } from './utils';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cx(
        'w-full appearance-none rounded-md border border-border-base bg-panel px-3 py-2 text-sm text-text-main transition focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer',
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
);

Select.displayName = 'Select';
