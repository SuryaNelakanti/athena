import { useState } from 'react';

import { api } from '../../lib/api';
import { getErrorMessage } from '../../lib/errors';
import type { Dataset } from '../../types';

export type DatasetExampleType = 'gold' | 'anti_pattern';

export type DatasetRowDraft = {
  input: string;
  expected: string;
  example_type: DatasetExampleType;
};

const createEmptyDraft = (): DatasetRowDraft => ({
  input: '',
  expected: '',
  example_type: 'gold',
});

type DatasetTab = 'eval' | 'resources' | 'history';

export function useDatasetRowCreation(
  dataset: Dataset | null,
  activeTab: DatasetTab,
  loadRows: (dataset: Dataset) => Promise<void>,
) {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState<DatasetRowDraft>(createEmptyDraft);
  const [error, setError] = useState<string | null>(null);

  const updateDraft = (patch: Partial<DatasetRowDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const addRow = async () => {
    if (!dataset) return;
    setError(null);
    if (!draft.input.trim()) {
      setError('Input is required');
      return;
    }
    const isEvalTab = activeTab === 'eval';
    if (isEvalTab && !draft.expected.trim()) {
      setError('Expected output is required');
      return;
    }

    try {
      await api.addDatasetRow(dataset.id, {
        input: isEvalTab ? { prompt: draft.input } : { text: draft.input },
        expected: isEvalTab ? { answer: draft.expected } : undefined,
        row_kind: isEvalTab ? 'eval' : 'resource',
        eval_label: isEvalTab ? draft.example_type : undefined,
        example_type: isEvalTab ? draft.example_type : undefined,
      });
      await loadRows(dataset);
      setIsOpen(false);
      setDraft(createEmptyDraft());
    } catch (cause: unknown) {
      setError(getErrorMessage(cause, 'Failed to add example'));
    }
  };

  return { isOpen, setIsOpen, draft, updateDraft, error, addRow };
}
