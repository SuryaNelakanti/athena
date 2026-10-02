import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { getErrorMessage } from '../../lib/errors';
import type { ModelRegistry, ProviderKeyStatus } from '../../types';

export type ProviderId = ProviderKeyStatus['provider'];

export const useProviderSettings = () => {
  const [providers, setProviders] = useState<ProviderKeyStatus[]>([]);
  const [models, setModels] = useState<ModelRegistry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [busyProvider, setBusyProvider] = useState<string | null>(null);
  const [expandedProviders, setExpandedProviders] = useState<Set<ProviderId>>(new Set());
  const loadRequestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++loadRequestIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const [nextProviders, nextModels] = await Promise.all([
        api.getProviderStatuses(),
        api.getModelRegistry(false),
      ]);
      if (requestId !== loadRequestIdRef.current) return;

      setProviders(nextProviders);
      setModels(nextModels);
      const configuredProviders = new Set(
        nextProviders.filter((provider) => provider.configured).map((provider) => provider.provider)
      );
      setExpandedProviders(configuredProviders);
    } catch (cause: unknown) {
      if (requestId === loadRequestIdRef.current) {
        setError(getErrorMessage(cause, 'Failed to load settings'));
      }
    } finally {
      if (requestId === loadRequestIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      loadRequestIdRef.current += 1;
    };
  }, [load]);

  const sync = useCallback(async (provider?: ProviderId) => {
    setError(null);
    setBusyProvider(provider || 'all');
    try {
      await api.syncModelRegistry(provider ? { provider } : {});
      await load();
    } catch (cause: unknown) {
      setError(getErrorMessage(cause, 'Failed to sync models'));
    } finally {
      setBusyProvider(null);
    }
  }, [load]);

  const setKey = useCallback(async (provider: ProviderId) => {
    setError(null);
    setBusyProvider(provider);
    try {
      await api.setProviderApiKey(provider, (apiKeys[provider] || '').trim());
      setApiKeys((current) => ({ ...current, [provider]: '' }));
      await api.syncModelRegistry({ provider });
      await load();
      setExpandedProviders((current) => new Set([...current, provider]));
    } catch (cause: unknown) {
      setError(getErrorMessage(cause, 'Failed to set api key'));
    } finally {
      setBusyProvider(null);
    }
  }, [apiKeys, load]);

  const clearKey = useCallback(async (provider: ProviderId) => {
    setError(null);
    setBusyProvider(provider);
    try {
      await api.clearProviderApiKey(provider);
      await load();
    } catch (cause: unknown) {
      setError(getErrorMessage(cause, 'Failed to clear api key'));
    } finally {
      setBusyProvider(null);
    }
  }, [load]);

  const updateApiKey = useCallback((provider: ProviderId, value: string) => {
    setApiKeys((current) => ({ ...current, [provider]: value }));
  }, []);

  const toggleModel = useCallback(async (id: string, enabled: boolean) => {
    setError(null);
    try {
      const updated = await api.updateModelRegistryEntry(id, { enabled });
      setModels((current) => current.map((model) => (model.id === updated.id ? updated : model)));
    } catch (cause: unknown) {
      setError(getErrorMessage(cause, 'Failed to update model'));
    }
  }, []);

  const soloModel = useCallback(async (modelId: string, provider: ProviderId) => {
    setError(null);
    setBusyProvider(provider);
    try {
      const providerModels = models.filter((model) => model.provider === provider);
      await Promise.all(
        providerModels.map((model) =>
          api.updateModelRegistryEntry(model.id, { enabled: model.id === modelId })
        )
      );
      setModels((current) =>
        current.map((model) =>
          model.provider === provider ? { ...model, enabled: model.id === modelId } : model
        )
      );
    } catch (cause: unknown) {
      setError(getErrorMessage(cause, 'Failed to solo model'));
    } finally {
      setBusyProvider(null);
    }
  }, [models]);

  const setAllModels = useCallback(async (provider: ProviderId, enabled: boolean) => {
    setError(null);
    setBusyProvider(provider);
    try {
      const providerModels = models.filter((model) => model.provider === provider);
      await Promise.all(
        providerModels.map((model) => api.updateModelRegistryEntry(model.id, { enabled }))
      );
      setModels((current) =>
        current.map((model) => (model.provider === provider ? { ...model, enabled } : model))
      );
    } catch (cause: unknown) {
      setError(getErrorMessage(cause, 'Failed to update models'));
    } finally {
      setBusyProvider(null);
    }
  }, [models]);

  const toggleProvider = useCallback((provider: ProviderId) => {
    setExpandedProviders((current) => {
      const next = new Set(current);
      if (next.has(provider)) next.delete(provider);
      else next.add(provider);
      return next;
    });
  }, []);

  return {
    providers,
    models,
    loading,
    error,
    apiKeys,
    busyProvider,
    expandedProviders,
    sync,
    setKey,
    clearKey,
    updateApiKey,
    toggleModel,
    soloModel,
    setAllModels,
    toggleProvider,
  };
};

export type ProviderSettingsController = ReturnType<typeof useProviderSettings>;
