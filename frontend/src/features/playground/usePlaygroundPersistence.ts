import { useState } from 'react';
import { api } from '../../lib/api';
import { getErrorMessage } from '../../lib/errors';
import type { Playground } from '../../types';
import type { PlaygroundConfig } from './model';

type UsePlaygroundPersistenceOptions = {
  projectId: string;
  activePlaygroundId: string | null;
  playgroundName: string;
  playgroundDescription: string;
  config: PlaygroundConfig;
  currentSignature: string;
  refreshWorkspace: () => Promise<void>;
  clearRunNotice: () => void;
  showRunNotice: (message: string) => void;
  onSaved: (playground: Playground, signature: string) => void;
  onDeleted: () => void;
};

export const usePlaygroundPersistence = ({
  projectId,
  activePlaygroundId,
  playgroundName,
  playgroundDescription,
  config,
  currentSignature,
  refreshWorkspace,
  clearRunNotice,
  showRunNotice,
  onSaved,
  onDeleted,
}: UsePlaygroundPersistenceOptions) => {
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!projectId || !playgroundName.trim()) return;
    setSaving(true);
    clearRunNotice();
    try {
      const payload = {
        name: playgroundName.trim(),
        description: playgroundDescription.trim() || undefined,
        config,
      };
      const saved = activePlaygroundId
        ? await api.updatePlayground(activePlaygroundId, payload)
        : await api.createPlayground({ project_id: projectId, ...payload });
      onSaved(saved, currentSignature);
      await refreshWorkspace();
    } catch (cause: unknown) {
      showRunNotice(getErrorMessage(cause, 'Failed to save playground'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!activePlaygroundId) return;
    try {
      await api.deletePlayground(activePlaygroundId);
      onDeleted();
      await refreshWorkspace();
    } catch (cause: unknown) {
      showRunNotice(getErrorMessage(cause, 'Failed to delete playground'));
    }
  };

  return { saving, save, remove };
};
