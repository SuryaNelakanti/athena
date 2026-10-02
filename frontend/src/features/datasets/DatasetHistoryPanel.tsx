import React from 'react';
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import type { DatasetRow, DatasetVersion } from '../../types';
import { Button, Card } from '../../components/ui';
import { extractExpected, extractText } from '../../lib/structuredData';

interface DatasetHistoryPanelProps {
  history: DatasetVersion[];
  loading: boolean;
  error: string | null;
  rowHistory: Record<string, DatasetRow[]>;
  rowHistoryErrors: Record<string, string>;
  expandedHistoryId: string | null;
  onToggleHistory: (entry: DatasetVersion) => void;
  onRetryHistory: () => void;
  onRetryRowHistory: (logicalId: string) => void;
}

const DatasetHistoryPanel: React.FC<DatasetHistoryPanelProps> = ({
  history,
  loading,
  error,
  rowHistory,
  rowHistoryErrors,
  expandedHistoryId,
  onToggleHistory,
  onRetryHistory,
  onRetryRowHistory,
}) => (
  <div>
    {error && (
      <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-md bg-rose-500/10 p-3 text-xs text-rose-500">
        <span>{error}</span>
        <Button variant="secondary" size="sm" onClick={onRetryHistory}>Retry</Button>
      </div>
    )}
    {loading ? (
      <div className="py-20 text-center text-text-muted italic">Loading history...</div>
    ) : history.length === 0 && !error ? (
      <div className="py-20 text-center text-text-muted italic">No history yet.</div>
    ) : history.length === 0 ? null : (
      <div className="space-y-3">
        {history.map((entry) => {
          const isExpanded = expandedHistoryId === entry.id;
          const rowsForLogical = entry.logical_id ? rowHistory[entry.logical_id] : undefined;
          const rowHistoryError = entry.logical_id ? rowHistoryErrors[entry.logical_id] : undefined;
          const currentRow = rowsForLogical?.find((row) => row.id === entry.row_id) || rowsForLogical?.[rowsForLogical.length - 1];
          const currentIndex = currentRow && rowsForLogical ? rowsForLogical.findIndex((row) => row.id === currentRow.id) : -1;
          const previousRow = currentIndex > 0 && rowsForLogical ? rowsForLogical[currentIndex - 1] : null;

          return (
            <Card key={entry.id} padded={false} className="overflow-hidden">
              <button
                onClick={() => onToggleHistory(entry)}
                className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-panel-hover transition-colors"
              >
                <div>
                  <div className="text-xs text-text-muted uppercase tracking-wider">Version {entry.version}</div>
                  <div className="text-sm font-bold text-text-main">{entry.action}</div>
                  <div className="text-[10px] text-text-muted mt-1">{new Date(entry.created_at).toLocaleString()}</div>
                </div>
                <div className="flex items-center gap-2">
                  {entry.action === 'flush' && <span className="text-[10px] text-amber-500 font-bold">Flush</span>}
                  {isExpanded ? (
                    <ChevronDownIcon className="w-5 h-5 text-text-muted" />
                  ) : (
                    <ChevronRightIcon className="w-5 h-5 text-text-muted" />
                  )}
                </div>
              </button>
              {isExpanded && entry.logical_id && (
                <div className="px-5 pb-5 pt-2 border-t border-border-base/50">
                  {!rowsForLogical ? (
                    rowHistoryError ? (
                      <div role="alert" className="flex items-center gap-3 text-xs text-rose-500">
                        <span>{rowHistoryError}</span>
                        <Button variant="secondary" size="sm" onClick={() => onRetryRowHistory(entry.logical_id!)}>Retry</Button>
                      </div>
                    ) : (
                      <div className="text-xs text-text-muted italic">Loading row history...</div>
                    )
                  ) : (
                    <div className="grid md:grid-cols-2 gap-4">
                      {previousRow && <RowRevision label="Previous" row={previousRow} />}
                      {currentRow && <RowRevision label="Current" row={currentRow} />}
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    )}
  </div>
);

const RowRevision: React.FC<{ label: string; row: DatasetRow }> = ({ label, row }) => (
  <div>
    <div className="text-[10px] uppercase tracking-wider text-text-muted font-bold mb-2">{label}</div>
    <div className="bg-app border border-border-base rounded-md p-3 text-xs text-text-main whitespace-pre-wrap">
      {`${extractText(row.input)}\n\nExpected: ${extractExpected(row.expected)}`}
    </div>
  </div>
);

export default DatasetHistoryPanel;
