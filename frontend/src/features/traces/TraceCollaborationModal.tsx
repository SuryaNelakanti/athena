import { useLayoutEffect, useState } from 'react';
import { Button, Input, Modal, Textarea } from '../../components/ui';
import { api } from '../../lib/api';
import { getErrorMessage } from '../../lib/errors';
import type { Trace } from '../../types';

export type TraceCollaborationKind = 'assignment' | 'mention' | 'share';

interface TraceCollaborationModalProps {
    trace: Trace;
    kind: TraceCollaborationKind | null;
    onClose: () => void;
}

export function TraceCollaborationModal({ trace, kind, onClose }: TraceCollaborationModalProps) {
    const [assignee, setAssignee] = useState('');
    const [mention, setMention] = useState('');
    const [note, setNote] = useState('');
    const [shareExpiry, setShareExpiry] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [shareUrl, setShareUrl] = useState<string | null>(null);

    useLayoutEffect(() => {
        if (!kind) return;
        setAssignee('');
        setMention('');
        setNote('');
        setShareExpiry('');
        setError(null);
        setMessage(null);
        setBusy(false);
        setShareUrl(null);
    }, [kind]);

    const submit = async () => {
        if (!kind) return;
        setError(null);
        setMessage(null);
        setBusy(true);

        try {
            if (kind === 'assignment') {
                if (!assignee.trim()) {
                    setError('Assignee is required.');
                    return;
                }
                await api.createAssignment({
                    project_id: trace.project_id,
                    object_type: 'trace',
                    object_id: trace.id,
                    assignee: assignee.trim(),
                    note: note.trim() || undefined,
                });
                setMessage('Assignment created.');
                return;
            }

            if (kind === 'mention') {
                if (!mention.trim()) {
                    setError('Mention target is required.');
                    return;
                }
                await api.createMention({
                    project_id: trace.project_id,
                    object_type: 'trace',
                    object_id: trace.id,
                    mentioned: mention.trim(),
                    note: note.trim() || undefined,
                });
                setMessage('Mention created.');
                return;
            }

            const expiresAt = shareExpiry ? new Date(shareExpiry).getTime() : undefined;
            const created = await api.createShareLink({
                project_id: trace.project_id,
                object_type: 'trace',
                object_id: trace.id,
                expires_at: expiresAt,
            });
            setShareUrl(`${window.location.origin}/share-links/${created.token}`);
            setMessage('Share link created.');
        } catch (cause: unknown) {
            setError(getErrorMessage(cause, 'Failed to create collaboration item.'));
        } finally {
            setBusy(false);
        }
    };

    const copyShareUrl = async () => {
        if (!shareUrl || !navigator.clipboard) return;
        try {
            await navigator.clipboard.writeText(shareUrl);
            setMessage('Share link copied.');
        } catch (cause: unknown) {
            setError(getErrorMessage(cause, 'Unable to copy share link.'));
        }
    };

    const title = kind === 'assignment'
        ? 'Create assignment'
        : kind === 'mention'
            ? 'Create mention'
            : 'Create share link';

    return (
        <Modal
            open={!!kind}
            title={title}
            description="Attach collaboration context to this trace."
            onClose={onClose}
            footer={(
                <div className="flex items-center justify-end gap-2">
                    <Button variant="secondary" size="sm" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button variant="primary" size="sm" onClick={submit} disabled={busy}>
                        {busy ? 'Saving...' : 'Create'}
                    </Button>
                </div>
            )}
        >
            <div className="space-y-4">
                {error && (
                    <div className="text-xs text-rose-500 font-semibold bg-rose-500/10 rounded-md p-3">
                        {error}
                    </div>
                )}
                {message && (
                    <div className="text-xs text-emerald-600 font-semibold bg-emerald-500/10 rounded-md p-3">
                        {message}
                    </div>
                )}

                <div>
                    <label className="block text-[11px] font-medium text-text-muted">Object</label>
                    <div className="mt-1 rounded-md border border-border-base bg-app px-3 py-2 text-xs text-text-muted">
                        trace · {trace.id}
                    </div>
                </div>

                {kind === 'assignment' && (
                    <>
                        <div>
                            <label className="block text-[11px] font-medium text-text-muted">Assignee</label>
                            <Input
                                value={assignee}
                                onChange={(event) => setAssignee(event.target.value)}
                                placeholder="name@company.com"
                                className="mt-1"
                            />
                        </div>
                        <div>
                            <label className="block text-[11px] font-medium text-text-muted">Note</label>
                            <Textarea
                                rows={3}
                                value={note}
                                onChange={(event) => setNote(event.target.value)}
                                placeholder="Optional context"
                                className="mt-1"
                            />
                        </div>
                    </>
                )}

                {kind === 'mention' && (
                    <>
                        <div>
                            <label className="block text-[11px] font-medium text-text-muted">Mention</label>
                            <Input
                                value={mention}
                                onChange={(event) => setMention(event.target.value)}
                                placeholder="name@company.com"
                                className="mt-1"
                            />
                        </div>
                        <div>
                            <label className="block text-[11px] font-medium text-text-muted">Note</label>
                            <Textarea
                                rows={3}
                                value={note}
                                onChange={(event) => setNote(event.target.value)}
                                placeholder="Optional context"
                                className="mt-1"
                            />
                        </div>
                    </>
                )}

                {kind === 'share' && (
                    <>
                        <div>
                            <label className="block text-[11px] font-medium text-text-muted">Expires At</label>
                            <Input
                                type="datetime-local"
                                value={shareExpiry}
                                onChange={(event) => setShareExpiry(event.target.value)}
                                className="mt-1"
                            />
                        </div>
                        {shareUrl && (
                            <div className="flex items-center justify-between rounded-md border border-border-base bg-app px-3 py-2 text-xs text-text-main">
                                <span className="font-mono truncate max-w-[220px]">{shareUrl}</span>
                                <Button size="sm" variant="ghost" onClick={copyShareUrl}>
                                    Copy
                                </Button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </Modal>
    );
}
