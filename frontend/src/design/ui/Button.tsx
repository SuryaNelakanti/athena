import React from 'react';
import { cx } from './utils';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const base =
  'inline-flex items-center justify-center gap-2 rounded-md border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-white border-primary hover:bg-primary-hover shadow-xs',
  secondary: 'bg-panel text-text-main border-border-base hover:bg-panel-hover',
  outline: 'bg-transparent text-text-main border-border-base hover:bg-panel-hover',
  ghost: 'bg-transparent text-text-muted border-transparent hover:bg-panel-hover hover:text-text-main',
  danger: 'bg-rose-500 text-white border-rose-500 hover:bg-rose-600',
  success: 'bg-emerald-500 text-white border-emerald-500 hover:bg-emerald-600',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-9 px-4 text-sm',
  lg: 'h-10 px-5 text-sm',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'secondary', size = 'md', ...props }, ref) => (
    <button
      ref={ref}
      className={cx(base, variants[variant], sizes[size], className)}
      {...props}
    />
  )
);

Button.displayName = 'Button';

export interface IconButtonProps extends ButtonProps {
  square?: boolean;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, size = 'md', square = true, ...props }, ref) => {
    const sizeClass = size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-10 w-10' : 'h-9 w-9';
    return (
      <button
        ref={ref}
        className={cx(
          base,
          variants[props.variant || 'ghost'],
          square ? sizeClass : sizes[size],
          className
        )}
        {...props}
      />
    );
  }
);

IconButton.displayName = 'IconButton';
