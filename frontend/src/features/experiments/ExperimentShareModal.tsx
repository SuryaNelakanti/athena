import { Button, Input, Modal } from '../../components/ui';

export type ExperimentShareType = 'experiment' | 'result';

interface ExperimentShareModalProps {
  open: boolean;
  shareType: ExperimentShareType;
  shareUrl: string | null;
  loading: boolean;
  error: string | null;
  copied: boolean;
  onClose: () => void;
  onCopy: () => void;
}

export function ExperimentShareModal({
  open,
  shareType,
  shareUrl,
  loading,
  error,
  copied,
  onClose,
  onCopy,
}: ExperimentShareModalProps) {
  const isResultShare = shareType === 'result';

  return (
    <Modal
      open={open}
      title={isResultShare ? 'Share Result' : 'Share Experiment'}
      description={isResultShare ? 'Create a link to this result.' : 'Create a link to this experiment.'}
      onClose={onClose}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
          <Button variant="primary" size="sm" onClick={onCopy} disabled={!shareUrl || copied}>
            {copied ? 'Copied' : 'Copy link'}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        {loading ? (
          <div className="text-sm text-text-muted">Creating share link...</div>
        ) : error ? (
          <div className="text-sm text-rose-500">{error}</div>
        ) : shareUrl ? (
          <Input value={shareUrl} readOnly />
        ) : (
          <div className="text-sm text-text-muted">Ready to generate link.</div>
        )}
        <div className="text-xs text-text-muted">Anyone with this link can view this experiment.</div>
      </div>
    </Modal>
  );
}
