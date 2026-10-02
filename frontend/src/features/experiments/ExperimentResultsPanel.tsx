import { useMemo } from 'react';
import {
  ArrowUpRightIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  LinkIcon,
} from '@heroicons/react/24/outline';
import { Badge, Button, Card, Input, Select } from '../../components/ui';
import { formatNumber, formatPercent } from './formatting';
import { extractExpected, extractOutputText, extractText } from '../../lib/structuredData';
import type {
  DatasetRow,
  ExperimentRun,
  ExperimentRunResult,
  Function,
  ScorerConfig,
} from '../../types';

const RESULT_FILTERS = ['all', 'passing', 'failing', 'unscored'] as const;
export type ExperimentResultFilter = typeof RESULT_FILTERS[number];
type ResultStatus = Exclude<ExperimentResultFilter, 'all'>;

const parseResultFilter = (value: string): ExperimentResultFilter =>
  RESULT_FILTERS.find((filter) => filter === value) || 'all';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const getOutputTraceId = (output: unknown): string | undefined => {
  if (!isRecord(output)) return undefined;
  const traceId = output.athena_trace_id;
  return typeof traceId === 'string' ? traceId : undefined;
};

export interface ExperimentResultsPanelProps {
  results: ExperimentRunResult[];
  datasetRows: DatasetRow[];
  selectedRun: ExperimentRun | null;
  configuredScorers: ScorerConfig[];
  scorerIndex: ReadonlyMap<string, Function>;
  filter: ExperimentResultFilter;
  search: string;
  expandedResultId: string | null;
  onFilterChange: (filter: ExperimentResultFilter) => void;
  onSearchChange: (search: string) => void;
  onToggleResult: (resultId: string) => void;
  onOpenTrace: (traceId: string) => void;
  onOpenShare: (resultId: string) => void | Promise<void>;
}

export const ExperimentResultsPanel = ({
  results,
  datasetRows,
  selectedRun,
  configuredScorers,
  scorerIndex,
  filter,
  search,
  expandedResultId,
  onFilterChange,
  onSearchChange,
  onToggleResult,
  onOpenTrace,
  onOpenShare,
}: ExperimentResultsPanelProps) => {
  const datasetRowById = useMemo(
    () => new Map(datasetRows.map((row) => [row.id, row])),
    [datasetRows]
  );
  const primaryScorer = useMemo(
    () => configuredScorers.find((scorer) => scorer.is_primary) || configuredScorers[0] || null,
    [configuredScorers]
  );
  const primaryThreshold = primaryScorer?.threshold ?? 0.8;
  const runSummary = selectedRun?.summary || {};
  const primaryScoreAverage = typeof runSummary.avg_score === 'number' ? runSummary.avg_score : null;
  const weightedScoreAverage =
    typeof runSummary.weighted_avg_score === 'number' ? runSummary.weighted_avg_score : null;

  const getScoreValue = (scoreMap: Record<string, unknown>, scorerType: string) => {
    const value = scoreMap[scorerType];
    return typeof value === 'number' ? value : null;
  };

  const getResultStatus = (result: ExperimentRunResult): ResultStatus => {
    const score = primaryScorer ? getScoreValue(result.scores || {}, primaryScorer.type) : null;
    if (score === null) return 'unscored';
    return score >= primaryThreshold ? 'passing' : 'failing';
  };

  const filteredResults = useMemo(() => {
    const query = search.trim().toLowerCase();
    return results.filter((result) => {
      const status = getResultStatus(result);
      if (filter !== 'all' && status !== filter) return false;
      if (!query) return true;

      const row = datasetRowById.get(result.dataset_row_id);
      const inputText = row ? extractText(row.input).toLowerCase() : '';
      const expectedText = row ? extractExpected(row.expected).toLowerCase() : '';
      const outputText = extractOutputText(result.output).toLowerCase();
      return inputText.includes(query) || expectedText.includes(query) || outputText.includes(query);
    });
  }, [results, filter, search, datasetRowById, primaryScorer]);

  const scoredResults = useMemo(
    () => results.filter((result) => getResultStatus(result) !== 'unscored'),
    [results, primaryScorer]
  );
  const passRate = scoredResults.length
    ? scoredResults.filter((result) => getResultStatus(result) === 'passing').length / scoredResults.length
    : null;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-text-muted">Pass rate</div>
            <div className="text-xl font-semibold text-text-main mt-1">{formatPercent(passRate, 1)}</div>
            <div className="text-[11px] text-text-muted">{scoredResults.length} scored</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-text-muted">Primary avg</div>
            <div className="text-xl font-semibold text-text-main mt-1">
              {formatNumber(primaryScoreAverage, 2)}
            </div>
            <div className="text-[11px] text-text-muted">{primaryScorer?.type || 'n/a'}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-text-muted">Weighted avg</div>
            <div className="text-xl font-semibold text-text-main mt-1">
              {formatNumber(weightedScoreAverage, 2)}
            </div>
            <div className="text-[11px] text-text-muted">All scorers</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-text-muted">Rows</div>
            <div className="text-xl font-semibold text-text-main mt-1">{results.length}</div>
            <div className="text-[11px] text-text-muted">Run results</div>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-2">
            <Select value={filter} onChange={(event) => onFilterChange(parseResultFilter(event.target.value))}>
              <option value="all">All results</option>
              <option value="passing">Passing</option>
              <option value="failing">Failing</option>
              <option value="unscored">Unscored</option>
            </Select>
            <Input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search inputs, outputs, expected..."
            />
          </div>
          <div className="text-xs text-text-muted">Primary threshold {formatNumber(primaryThreshold, 2)}</div>
        </div>
      </Card>

      <div className="space-y-3">
        {filteredResults.map((result) => {
          const row = datasetRowById.get(result.dataset_row_id);
          const status = getResultStatus(result);
          const statusVariant = status === 'passing' ? 'success' : status === 'failing' ? 'danger' : 'warning';
          const traceId = getOutputTraceId(result.output);
          const primaryScore = primaryScorer
            ? getScoreValue(result.scores || {}, primaryScorer.type)
            : null;

          return (
            <Card key={result.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <button
                  className="flex items-center gap-2 text-left"
                  onClick={() => onToggleResult(result.id)}
                >
                  {expandedResultId === result.id ? (
                    <ChevronDownIcon className="w-4 h-4" />
                  ) : (
                    <ChevronRightIcon className="w-4 h-4" />
                  )}
                  <div>
                    <div className="text-sm font-semibold text-text-main">
                      Row {row?.logical_id || result.dataset_row_id}
                    </div>
                    <div className="text-[11px] text-text-muted">
                      {row ? extractText(row.input).slice(0, 120) : 'Dataset row missing'}
                    </div>
                  </div>
                </button>
                <div className="flex items-center gap-2">
                  <Badge variant={statusVariant}>{status}</Badge>
                  <Badge variant="primary">
                    {primaryScore !== null ? formatNumber(primaryScore, 2) : 'n/a'}
                  </Badge>
                  {traceId && (
                    <Button variant="secondary" size="sm" onClick={() => onOpenTrace(traceId)}>
                      <ArrowUpRightIcon className="w-3 h-3" /> Trace
                    </Button>
                  )}
                  <Button variant="secondary" size="sm" onClick={() => onOpenShare(result.id)}>
                    <LinkIcon className="w-3 h-3" /> Share
                  </Button>
                </div>
              </div>

              {expandedResultId === result.id && (
                <div className="mt-4 space-y-3 text-xs text-text-muted">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-text-muted">Input</div>
                      <div className="mt-1 whitespace-pre-wrap text-text-main">
                        {row ? extractText(row.input) : 'n/a'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-text-muted">Expected</div>
                      <div className="mt-1 whitespace-pre-wrap text-text-main">
                        {row ? extractExpected(row.expected) : 'n/a'}
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-text-muted">Output</div>
                    <div className="mt-1 whitespace-pre-wrap text-text-main">
                      {extractOutputText(result.output)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-text-muted">Scorers</div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {configuredScorers.map((scorer) => {
                        const score = getScoreValue(result.scores || {}, scorer.type);
                        const threshold = scorer.threshold ?? 0.8;
                        const variant =
                          score === null ? 'warning' : score >= threshold ? 'success' : 'danger';
                        const meta = scorerIndex.get(scorer.type);
                        const label = meta?.display_name || scorer.type;
                        return (
                          <Badge key={scorer.type} variant={variant}>
                            {label}: {score === null ? 'unscored' : formatNumber(score, 2)}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
};
