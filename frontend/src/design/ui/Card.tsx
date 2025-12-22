import React from 'react';
import { cx } from './utils';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padded?: boolean;
  hoverable?: boolean;
}

export const Card: React.FC<CardProps> = ({ className, padded = true, hoverable = false, ...props }) => (
  <div
    className={cx(
      'rounded-lg border border-border-hairline bg-panel shadow-warm transition-all duration-200',
      padded ? 'p-5' : '',
      hoverable ? 'hover-lift cursor-pointer' : '',
      className
    )}
    {...props}
  />
);
