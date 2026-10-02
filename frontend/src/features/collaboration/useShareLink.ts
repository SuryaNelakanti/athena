import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { getErrorMessage } from '../../lib/errors';

export interface ShareLinkTarget {
  projectId?: string;
  objectType: string;
  objectId: string;
}

interface UseShareLinkOptions {
  clipboardUnavailableMessage: string | null;
}

export const useShareLink = (
  target: ShareLinkTarget | null,
  { clipboardUnavailableMessage }: UseShareLinkOptions
) => {
  const targetKey = target ? `${target.projectId ?? ''}:${target.objectType}:${target.objectId}` : '';
  const targetKeyRef = useRef(targetKey);
  targetKeyRef.current = targetKey;

  const [isOpen, setIsOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    setIsOpen(false);
    setUrl(null);
    setIsLoading(false);
    setError(null);
    setIsCopied(false);
  }, [targetKey]);

  const open = async () => {
    if (!target) return;
    const requestedTargetKey = targetKey;
    setIsOpen(true);
    setIsLoading(true);
    setError(null);
    setUrl(null);
    setIsCopied(false);

    try {
      const created = await api.createShareLink({
        project_id: target.projectId,
        object_type: target.objectType,
        object_id: target.objectId,
      });
      if (targetKeyRef.current !== requestedTargetKey) return;
      setUrl(`${window.location.origin}/share-links/${created.token}`);
    } catch (cause: unknown) {
      if (targetKeyRef.current === requestedTargetKey) {
        setError(getErrorMessage(cause, 'Failed to create share link'));
      }
    } finally {
      if (targetKeyRef.current === requestedTargetKey) setIsLoading(false);
    }
  };

  const close = () => setIsOpen(false);

  const copy = async () => {
    if (!url) return;
    const requestedTargetKey = targetKey;
    if (!navigator.clipboard) {
      if (clipboardUnavailableMessage) setError(clipboardUnavailableMessage);
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      if (targetKeyRef.current === requestedTargetKey) setIsCopied(true);
      setTimeout(() => {
        if (targetKeyRef.current === requestedTargetKey) setIsCopied(false);
      }, 2000);
    } catch (cause: unknown) {
      if (targetKeyRef.current === requestedTargetKey) {
        setError(getErrorMessage(cause, 'Failed to copy share link'));
      }
    }
  };

  return { isOpen, url, isLoading, error, isCopied, open, close, copy };
};
