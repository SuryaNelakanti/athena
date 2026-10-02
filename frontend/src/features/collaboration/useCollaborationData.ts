import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { getErrorMessage } from '../../lib/errors';
import type { Assignment, Mention, ShareLink } from '../../types';

export function useCollaborationData(projectId: string) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!projectId) return;

    let active = true;
    setLoading(true);
    setError(null);

    Promise.all([
      api.listAssignments({ project_id: projectId }),
      api.listMentions({ project_id: projectId }),
      api.listShareLinks({ project_id: projectId }),
    ])
      .then(([loadedAssignments, loadedMentions, loadedShareLinks]) => {
        if (!active) return;
        setAssignments(loadedAssignments);
        setMentions(loadedMentions);
        setShareLinks(loadedShareLinks);
      })
      .catch((cause: unknown) => {
        if (active) setError(getErrorMessage(cause, 'Failed to load collaboration items'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [projectId, retryKey]);

  return {
    assignments,
    error,
    loading,
    mentions,
    retry: () => setRetryKey((current) => current + 1),
    shareLinks,
  };
}
