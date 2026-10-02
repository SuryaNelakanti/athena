import type { ReactNode } from 'react';

export interface PlaygroundTraceModalProps {
  open: boolean;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  children: ReactNode;
}

export const PlaygroundTraceModal = ({
  open,
  loading,
  error,
  onClose,
  children,
}: PlaygroundTraceModalProps) => {
  if (!open) return null;

  return (
    <div className='fixed inset-0 z-50 bg-black/40 backdrop-blur-sm p-4' onClick={onClose}>
      <div
        className='absolute inset-4 rounded-xl border border-border-base bg-panel shadow-lg overflow-hidden'
        onClick={(event) => event.stopPropagation()}
      >
        {loading && (
          <div className='h-full w-full flex items-center justify-center text-text-muted'>
            Loading trace...
          </div>
        )}
        {error && (
          <div className='h-full w-full flex items-center justify-center text-rose-600'>{error}</div>
        )}
        {!loading && !error && children}
      </div>
    </div>
  );
};
