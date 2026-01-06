import React from 'react';
import { cx } from './utils';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cx(
        'w-full rounded-md border border-border-base bg-panel px-3 py-2 text-sm text-text-main placeholder:text-text-muted/60 transition focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20',
        className
      )}
      {...props}
    />
  )
);

Textarea.displayName = 'Textarea';
