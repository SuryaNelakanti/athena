export interface ScorerDraftConfig {
  type: string;
  weight?: number | '';
  threshold?: number | '';
  is_primary?: boolean;
}

export interface ExperimentVersionDraft {
  parent_version_id: string;
  model_registry_id: string;
  temperature: number;
  max_tokens: string;
  top_p: string;
  frequency_penalty: string;
  presence_penalty: string;
  system_prompt: string;
  prompt_template: string;
  notes: string;
  scorers: ScorerDraftConfig[];
}
