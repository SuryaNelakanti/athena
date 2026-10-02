import React from 'react';
import { Button, Input, Modal } from '../../components/ui';

interface ShareLinkModalProps {
  open: boolean;
  title: string;
  description: string;
  audienceDescription: string;
  loading: boolean;
  error: string | null;
  url: string | null;
  copied: boolean;
  onClose: () => void;
  onCopy: () => void;
}

const ShareLinkModal: React.FC<ShareLinkModalProps> = ({
  open,
  title,
  description,
  audienceDescription,
  loading,
  error,
  url,
  copied,
  onClose,
  onCopy,
}) => (
  <Modal
    open={open}
    title={title}
    description={description}
    onClose={onClose}
    footer={(
      <div className="flex justify-end">
        <Button variant="primary" onClick={onClose}>Done</Button>
      </div>
    )}
  >
    {loading ? (
      <div className="py-8 text-center text-text-muted italic">Generating link...</div>
    ) : error ? (
      <div className="text-rose-500 text-sm">{error}</div>
    ) : (
      <div className="space-y-4">
        <div className="text-sm font-medium text-text-main">Share Link</div>
        <div className="flex gap-2">
          <Input value={url || ''} readOnly className="font-mono text-xs" />
          <Button onClick={onCopy} variant={copied ? 'success' : 'secondary'}>
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
        <p className="text-xs text-text-muted">{audienceDescription}</p>
      </div>
    )}
  </Modal>
);

export default ShareLinkModal;
