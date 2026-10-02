import { useEffect, useState } from 'react';

import { api, type View } from '../../lib/api';
import { getErrorMessage } from '../../lib/errors';
import type { Filter } from './filterConfig';

export function useSavedLogViews(projectId: string) {
  const [views, setViews] = useState<View[]>([]);
  const [viewsError, setViewsError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    let active = true;
    if (!projectId) {
      setViews([]);
      setViewsError(null);
      return () => {
        active = false;
      };
    }

    setViewsError(null);
    setViews([]);
    api.getViews(projectId)
      .then((loadedViews) => {
        if (!active) return;
        setViews(loadedViews.filter((view) => (
          (view.entity_type || view.config?.entity_type) === 'logs' || !view.entity_type
        )));
      })
      .catch((cause: unknown) => {
        if (active) setViewsError(getErrorMessage(cause, 'Unable to load saved views.'));
      });

    return () => {
      active = false;
    };
  }, [projectId, refreshVersion]);

  const saveView = async (name: string, filters: Filter[]): Promise<boolean> => {
    if (!name.trim() || !projectId) return false;
    setViewsError(null);
    try {
      await api.createView({
        project_id: projectId,
        name,
        entity_type: 'logs',
        config: {
          entity_type: 'logs',
          filters,
        },
      });
      setRefreshVersion((version) => version + 1);
      return true;
    } catch (cause: unknown) {
      setViewsError(getErrorMessage(cause, 'Unable to save this view.'));
      return false;
    }
  };

  const deleteView = async (viewId: string): Promise<void> => {
    setViewsError(null);
    try {
      await api.deleteView(viewId);
      setRefreshVersion((version) => version + 1);
    } catch (cause: unknown) {
      setViewsError(getErrorMessage(cause, 'Unable to delete this view.'));
    }
  };

  return { views, viewsError, saveView, deleteView };
}
