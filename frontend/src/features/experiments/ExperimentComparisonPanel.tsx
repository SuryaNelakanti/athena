import React from 'react';
import { Badge, Card, Select } from '../../components/ui';
import type {
  ExperimentComparisonResult,
  Function as FunctionAsset,
  ScorerComparisonSummary,
  ScorerConfig,
} from '../../types';
import { formatNumber } from './formatting';

export type ExperimentComparisonFilter = 'all' | 'improved' | 'regressed' | 'unchanged';

interface ExperimentComparisonPanelProps {
  result: ExperimentComparisonResult;
  filter: ExperimentComparisonFilter;
  scorers: ScorerConfig[];
  scorerIndex: Map<string, FunctionAsset>;
  onFilterChange: (filter: ExperimentComparisonFilter) => void;
}

export const ExperimentComparisonPanel: React.FC<ExperimentComparisonPanelProps> = ({
  result,
  filter,
  scorers,
  scorerIndex,
  onFilterChange,
}) => (
  <>
    <Card className="p-4 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="p-3 rounded-lg border border-border-base">
          <div className="text-[10px] uppercase tracking-widest text-text-muted">Improved</div>
          <div className="text-xl font-semibold text-emerald-500 mt-1">{result.delta_summary.improved_count}</div>
        </div>
        <div className="p-3 rounded-lg border border-border-base">
          <div className="text-[10px] uppercase tracking-widest text-text-muted">Regressed</div>
          <div className="text-xl font-semibold text-rose-500 mt-1">{result.delta_summary.regressed_count}</div>
        </div>
        <div className="p-3 rounded-lg border border-border-base">
          <div className="text-[10px] uppercase tracking-widest text-text-muted">Unchanged</div>
          <div className="text-xl font-semibold text-text-main mt-1">{result.delta_summary.unchanged_count}</div>
        </div>
      </div>

      <div>
        <div className="text-xs uppercase tracking-widest text-text-muted font-semibold mb-2">Per-scorer delta</div>
        <div className="space-y-2">
          {Object.entries(
            result.delta_summary.per_scorer as Record<string, ScorerComparisonSummary>
          ).map(([scorerType, summary]) => {
            const meta = scorerIndex.get(scorerType);
            return (
              <div key={scorerType} className="flex items-center justify-between text-xs">
                <span className="text-text-main">{meta?.display_name || scorerType}</span>
                <span className="text-text-muted">
                  {formatNumber(summary.baseline, 2)} ? {formatNumber(summary.candidate, 2)} ({formatNumber(summary.delta, 2)})
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </Card>

    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="text-xs uppercase tracking-widest text-text-muted font-semibold">Row diffs</div>
        <Select value={filter} onChange={(event) => onFilterChange(event.target.value as ExperimentComparisonFilter)}>
          <option value="all">All</option>
          <option value="improved">Improved</option>
          <option value="regressed">Regressed</option>
          <option value="unchanged">Unchanged</option>
        </Select>
      </div>
      <div className="space-y-3">
        {result.rows
          .filter((row) => filter === 'all' || row.status === filter)
          .map((row) => (
            <div key={row.dataset_row_id} className="border border-border-base rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold text-text-main">Row {row.logical_id || row.dataset_row_id}</div>
                <Badge variant={row.status === 'improved' ? 'success' : row.status === 'regressed' ? 'danger' : 'neutral'}>
                  {row.status}
                </Badge>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-text-muted">Baseline</div>
                  <div className="mt-1 whitespace-pre-wrap text-text-main">{row.baseline.output_text || 'n/a'}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-text-muted">Candidate</div>
                  <div className="mt-1 whitespace-pre-wrap text-text-main">{row.candidate.output_text || 'n/a'}</div>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {scorers.map((scorer) => {
                  const baselineValue = row.baseline.scores[scorer.type];
                  const candidateValue = row.candidate.scores[scorer.type];
                  const baselineScore = typeof baselineValue === 'number' ? baselineValue : null;
                  const candidateScore = typeof candidateValue === 'number' ? candidateValue : null;
                  return (
                    <Badge key={scorer.type} variant="neutral">
                      {scorer.type}: {baselineScore === null ? 'n/a' : formatNumber(baselineScore, 2)} ? {candidateScore === null ? 'n/a' : formatNumber(candidateScore, 2)}
                    </Badge>
                  );
                })}
              </div>
            </div>
          ))}
      </div>
    </Card>
  </>
);
