import React from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { cx } from './utils';
import { IconButton } from './Button';

interface ModalProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export const Modal: React.FC<ModalProps> = ({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  className,
}) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className={cx('w-full max-w-lg rounded-lg border border-border-base bg-panel shadow-lg', className)}>
        <div className="flex items-start justify-between border-b border-border-base px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-text-main">{title}</h3>
            {description ? <p className="text-xs text-text-muted mt-1">{description}</p> : null}
          </div>
          <IconButton onClick={onClose} variant="ghost" size="sm" aria-label="Close">
            <XMarkIcon className="w-4 h-4" />
          </IconButton>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer ? <div className="border-t border-border-base px-5 py-4">{footer}</div> : null}
      </div>
    </div>
  );
};
