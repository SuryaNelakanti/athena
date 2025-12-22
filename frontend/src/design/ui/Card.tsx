import React from 'react';
import { cx } from './utils';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padded?: boolean;
}

export const Card: React.FC<CardProps> = ({ className, padded = true, ...props }) => (
  <div
    className={cx(
      'rounded-lg border border-border-base bg-panel shadow-xs',
      padded ? 'p-5' : '',
      className
    )}
    {...props}
  />
);
