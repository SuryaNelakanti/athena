import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { getErrorMessage } from '../../lib/errors';
import type {
  ExperimentVersion,
  ExperimentVersionCreateInput,
  ModelRegistry,
  ScorerConfig,
} from '../../types';
import type { ExperimentVersionDraft } from './versionDraft';

interface UseExperimentVersionDraftOptions {
  experimentId: string;
  models: ModelRegistry[];
  selectedVersion: ExperimentVersion | null;
  versions: ExperimentVersion[];
  defaultScorers: ScorerConfig[];
  onVersionCreated: (version: ExperimentVersion) => void;
  onErrorChange: (message: string | null) => void;
}

const createEmptyDraft = (): ExperimentVersionDraft => ({
  parent_version_id: '',
  model_registry_id: '',
  temperature: 1.0,
  max_tokens: '',
  top_p: '',
  frequency_penalty: '',
  presence_penalty: '',
  system_prompt: '',
  prompt_template: '',
  notes: '',
  scorers: [],
});

const optionalNumber = (value: string): number | undefined => (
  value ? Number(value) : undefined
);

function buildVersionPayload(draft: ExperimentVersionDraft): ExperimentVersionCreateInput {
  const hasPrimaryScorer = draft.scorers.some((scorer) => scorer.is_primary);
  const scorers = draft.scorers.map((scorer, index) => ({
    type: scorer.type,
    weight: typeof scorer.weight === 'number' ? scorer.weight : 1,
    threshold: typeof scorer.threshold === 'number' ? scorer.threshold : 0.8,
    is_primary: scorer.is_primary || (!hasPrimaryScorer && index === 0),
  }));

  return {
    parent_version_id: draft.parent_version_id || undefined,
    model_registry_id: draft.model_registry_id,
    temperature: Number.isFinite(draft.temperature) ? draft.temperature : 1,
    max_tokens: optionalNumber(draft.max_tokens),
    top_p: optionalNumber(draft.top_p),
    frequency_penalty: optionalNumber(draft.frequency_penalty),
    presence_penalty: optionalNumber(draft.presence_penalty),
    system_prompt: draft.system_prompt,
    prompt_template: draft.prompt_template || undefined,
    notes: draft.notes,
    scorers: scorers.length ? scorers : undefined,
  };
}

export function useExperimentVersionDraft({
  experimentId,
  models,
  selectedVersion,
  versions,
  defaultScorers,
  onVersionCreated,
  onErrorChange,
}: UseExperimentVersionDraftOptions) {
  const [draft, setDraft] = useState<ExperimentVersionDraft>(createEmptyDraft);
  const experimentGeneration = useRef(0);

  useEffect(() => {
    experimentGeneration.current += 1;
    return () => {
      experimentGeneration.current += 1;
    };
  }, [experimentId]);

  useEffect(() => {
    if (!models.length) return;
    setDraft((current) => ({
      ...current,
      model_registry_id: current.model_registry_id || models[0].id,
      parent_version_id: current.parent_version_id || selectedVersion?.id || versions[0]?.id || '',
      scorers: current.scorers.length ? current.scorers : defaultScorers,
    }));
  }, [models, selectedVersion, versions, defaultScorers]);

  const updateDraft = useCallback((changes: Partial<ExperimentVersionDraft>) => {
    setDraft((current) => ({ ...current, ...changes }));
  }, []);

  const toggleScorer = useCallback((scorerType: string) => {
    setDraft((current) => {
      const exists = current.scorers.some((scorer) => scorer.type === scorerType);
      if (exists) {
        const remaining = current.scorers.filter((scorer) => scorer.type !== scorerType);
        const hasPrimaryScorer = remaining.some((scorer) => scorer.is_primary);
        return {
          ...current,
          scorers: remaining.map((scorer, index) => (
            !hasPrimaryScorer && index === 0 ? { ...scorer, is_primary: true } : scorer
          )),
        };
      }

      return {
        ...current,
        scorers: [
          ...current.scorers,
          {
            type: scorerType,
            weight: 1,
            threshold: 0.8,
            is_primary: current.scorers.length === 0,
          },
        ],
      };
    });
  }, []);

  const setPrimaryScorer = useCallback((scorerType: string) => {
    setDraft((current) => ({
      ...current,
      scorers: current.scorers.map((scorer) => ({
        ...scorer,
        is_primary: scorer.type === scorerType,
      })),
    }));
  }, []);

  const updateScorerConfig = useCallback((
    scorerType: string,
    field: 'weight' | 'threshold',
    value: string,
  ) => {
    setDraft((current) => ({
      ...current,
      scorers: current.scorers.map((scorer) => (
        scorer.type === scorerType
          ? { ...scorer, [field]: value === '' ? '' : Number(value) }
          : scorer
      )),
    }));
  }, []);

  const createVersion = useCallback(async () => {
    if (!experimentId || !draft.model_registry_id) return;

    const generation = experimentGeneration.current;
    onErrorChange(null);
    try {
      const created = await api.createExperimentVersion(
        experimentId,
        buildVersionPayload(draft),
      );
      if (generation !== experimentGeneration.current) return;
      onVersionCreated(created);
    } catch (cause: unknown) {
      if (generation !== experimentGeneration.current) return;
      onErrorChange(getErrorMessage(cause, 'Failed to create version'));
    }
  }, [experimentId, draft, onErrorChange, onVersionCreated]);

  return {
    draft,
    updateDraft,
    toggleScorer,
    setPrimaryScorer,
    updateScorerConfig,
    createVersion,
  };
}
