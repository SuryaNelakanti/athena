import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { getErrorMessage } from '../../lib/errors';
import type { Function as FunctionAsset, FunctionCreateInput } from '../../types';

export type FunctionFilter = 'all' | FunctionAsset['type'];

export type FunctionDraft = {
  name: string;
  display_name: string;
  description: string;
  type: FunctionAsset['type'];
  runtime: FunctionAsset['runtime'];
  config: Record<string, unknown>;
};

const createEmptyFunctionDraft = (): FunctionDraft => ({
  name: '',
  display_name: '',
  description: '',
  type: 'scorer',
  runtime: 'llm_judge',
  config: {},
});

export function useFunctionCatalog(projectId: string) {
  const [functions, setFunctions] = useState<FunctionAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FunctionFilter>('all');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [draft, setDraft] = useState<FunctionDraft>(createEmptyFunctionDraft);
  const [llmJudgeCriteria, setLlmJudgeCriteria] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let isCurrent = true;
    if (!projectId) {
      setFunctions([]);
      setLoading(false);
      setLoadError(null);
      return () => { isCurrent = false; };
    }

    setLoading(true);
    setLoadError(null);
    const loadFunctions = async () => {
      try {
        const loadedFunctions = await api.getFunctions(projectId);
        if (isCurrent) setFunctions(loadedFunctions);
      } catch (cause: unknown) {
        if (isCurrent) setLoadError(getErrorMessage(cause, 'Failed to load functions'));
      } finally {
        if (isCurrent) setLoading(false);
      }
    };

    void loadFunctions();
    return () => { isCurrent = false; };
  }, [projectId, reloadKey]);

  const filteredFunctions = useMemo(() => (
    filter === 'all'
      ? functions
      : functions.filter((functionAsset) => functionAsset.type === filter)
  ), [functions, filter]);

  const builtinFunctions = useMemo(
    () => filteredFunctions.filter((functionAsset) => !functionAsset.project_id),
    [filteredFunctions],
  );
  const customFunctions = useMemo(
    () => filteredFunctions.filter((functionAsset) => Boolean(functionAsset.project_id)),
    [filteredFunctions],
  );

  const updateDraft = (patch: Partial<FunctionDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const createFunction = async () => {
    if (!draft.name.trim()) return;
    setCreateError(null);
    const config = draft.runtime === 'llm_judge'
      ? { criteria: llmJudgeCriteria, model: 'gpt-4o-mini' }
      : draft.config;
    const payload: FunctionCreateInput = {
      name: draft.name,
      display_name: draft.display_name || undefined,
      description: draft.description || undefined,
      type: draft.type,
      runtime: draft.runtime,
      config,
      enabled: true,
    };

    try {
      await api.createFunction(projectId, payload);
      setDraft(createEmptyFunctionDraft());
      setLlmJudgeCriteria('');
      setIsCreateModalOpen(false);
      setReloadKey((current) => current + 1);
    } catch (cause: unknown) {
      setCreateError(getErrorMessage(cause, 'Failed to create function'));
    }
  };

  const deleteFunction = async (functionId: string) => {
    setActionError(null);
    try {
      await api.deleteFunction(functionId);
      setReloadKey((current) => current + 1);
    } catch (cause: unknown) {
      setActionError(getErrorMessage(cause, 'Failed to delete function'));
    }
  };

  const retryLoad = () => setReloadKey((current) => current + 1);

  return {
    functions,
    filteredFunctions,
    builtinFunctions,
    customFunctions,
    loading,
    loadError,
    actionError,
    createError,
    filter,
    setFilter,
    isCreateModalOpen,
    setIsCreateModalOpen,
    draft,
    updateDraft,
    llmJudgeCriteria,
    setLlmJudgeCriteria,
    createFunction,
    deleteFunction,
    retryLoad,
  };
}
