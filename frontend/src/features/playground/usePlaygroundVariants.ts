import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_MAX_TOKENS,
  DEFAULT_MODELS,
  DEFAULT_TEMPERATURE,
  DEFAULT_TOP_P,
  buildDefaultVariants,
  makeId,
  normalizeVariant,
} from './model';
import type { ModelOption, PlaygroundRun, PlaygroundVariant } from './model';

type UsePlaygroundVariantsOptions = {
  modelOptions: ModelOption[];
  runs: PlaygroundRun[];
  removeRunsForVariant: (variantId: string) => void;
  removeRunsFromComparison: (runIds: string[]) => void;
};

export const usePlaygroundVariants = ({
  modelOptions,
  runs,
  removeRunsForVariant,
  removeRunsFromComparison,
}: UsePlaygroundVariantsOptions) => {
  const [variants, setVariants] = useState<PlaygroundVariant[]>(() =>
    buildDefaultVariants(DEFAULT_MODELS)
  );

  useEffect(() => {
    setVariants((current) => current.map((variant) => normalizeVariant(variant, modelOptions)));
  }, [modelOptions]);

  const loadVariants = useCallback((nextVariants: PlaygroundVariant[]) => {
    setVariants(nextVariants);
  }, []);
  const resetVariants = useCallback(
    () => setVariants(buildDefaultVariants(modelOptions)),
    [modelOptions],
  );

  const updateVariant = useCallback((variantId: string, patch: Partial<PlaygroundVariant>) => {
    setVariants((current) => current.map((variant) =>
      variant.id === variantId ? { ...variant, ...patch } : variant
    ));
  }, []);

  const addVariant = useCallback(() => {
    const base = modelOptions[0] || DEFAULT_MODELS[0];
    setVariants((current) => [
      ...current,
      {
        id: makeId('variant'),
        name: `Variant ${current.length + 1}`,
        model: base.id,
        provider: base.provider,
        temperature: DEFAULT_TEMPERATURE,
        top_p: DEFAULT_TOP_P,
        max_tokens: DEFAULT_MAX_TOKENS,
      },
    ]);
  }, [modelOptions]);

  const removeVariant = useCallback((variantId: string) => {
    if (variants.length <= 1) return;
    const removedRunIds = runs.filter((run) => run.variantId === variantId).map((run) => run.id);
    setVariants((current) => current.filter((variant) => variant.id !== variantId));
    removeRunsForVariant(variantId);
    removeRunsFromComparison(removedRunIds);
  }, [variants, runs, removeRunsForVariant, removeRunsFromComparison]);

  return { variants, loadVariants, resetVariants, addVariant, updateVariant, removeVariant };
};
