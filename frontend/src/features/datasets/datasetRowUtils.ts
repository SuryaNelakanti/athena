import type { DatasetRow } from '../../types';

export const getDatasetRowKind = (row: DatasetRow) => row.row_kind || 'eval';

export const getDatasetEvalLabel = (row: DatasetRow) => row.eval_label || row.example_type || 'gold';
