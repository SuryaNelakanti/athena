import React from 'react';
import {
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleStackIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  PlusIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import type { DatasetRow } from '../../types';
import { Badge, Button } from '../../components/ui';
import { extractExpected, extractText } from '../../lib/structuredData';
import { getDatasetEvalLabel, getDatasetRowKind } from './datasetRowUtils';

interface DatasetRowsPanelProps {
  rows: DatasetRow[];
  loading: boolean;
  error: string | null;
  isResourceTab: boolean;
  searchQuery: string;
  expandedRowId: string | null;
  onRetry: () => void;
  onAddRow: () => void;
  onToggleRow: (rowId: string | null) => void;
}

const DatasetRowsPanel: React.FC<DatasetRowsPanelProps> = ({
  rows,
  loading,
  error,
  isResourceTab,
  searchQuery,
  expandedRowId,
  onRetry,
  onAddRow,
  onToggleRow,
}) => (
  <>
    {error && (
      <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-md bg-rose-500/10 p-3 text-xs text-rose-500">
        <span>{error}</span>
        <Button variant="secondary" size="sm" onClick={onRetry}>Retry</Button>
      </div>
    )}
    {loading ? (
      <div className="py-20 text-center text-text-muted italic">Loading rows...</div>
    ) : error && rows.length === 0 ? null : rows.length === 0 ? (
      <div className="py-20 text-center">
        <CircleStackIcon className="w-12 h-12 text-text-muted/30 mx-auto mb-4" />
        <p className="text-text-muted italic mb-4">
          {searchQuery ? 'No rows match your search.' : 'No rows in this dataset yet.'}
        </p>
        <Button onClick={onAddRow} variant="outline" size="sm" className="text-primary">
          <PlusIcon className="w-4 h-4" /> {isResourceTab ? 'Add Your First Resource' : 'Add Your First Row'}
        </Button>
      </div>
    ) : (
      <div className="space-y-4">
        {rows.map((row, index) => {
          const isExpanded = expandedRowId === row.id;
          const inputText = extractText(row.input);
          const expectedText = extractExpected(row.expected);
          const rowKind = getDatasetRowKind(row);
          const isAntiPattern = rowKind === 'eval' && getDatasetEvalLabel(row) === 'anti_pattern';
          const isResource = rowKind === 'resource';

          return (
            <div
              key={row.id}
              className={`bg-panel border rounded-lg overflow-hidden transition-all ${isAntiPattern ? 'border-rose-500/30' : 'border-border-base hover:border-border-hover'}`}
            >
              <button
                onClick={() => onToggleRow(isExpanded ? null : row.id)}
                className="w-full px-6 py-4 flex items-start gap-4 text-left hover:bg-panel-hover transition-colors"
              >
                <div className={`flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center text-xs font-bold ${isAntiPattern
                  ? 'bg-rose-500/10 text-rose-500'
                  : 'bg-primary/10 text-primary'}`}>
                  {isAntiPattern ? <XMarkIcon className="w-4 h-4" /> : index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {isAntiPattern && <Badge variant="danger">Anti-Pattern</Badge>}
                    {isResource && <Badge variant="outline">Resource</Badge>}
                    {row.source_trace_id && <Badge variant="warning">From Trace</Badge>}
                  </div>
                  <p className="text-sm text-text-main line-clamp-2 font-medium">{inputText}</p>
                  <p className="text-xs text-text-muted mt-1 line-clamp-1">
                    <span className={isAntiPattern ? 'text-rose-500 font-medium' : 'text-emerald-500 font-medium'}>
                      {isResource ? 'Resource:' : isAntiPattern ? 'Avoid:' : 'Expected:'}
                    </span> {isResource ? 'Reference content' : expectedText}
                  </p>
                </div>
                {isExpanded ? (
                  <ChevronDownIcon className="w-5 h-5 text-text-muted flex-shrink-0" />
                ) : (
                  <ChevronRightIcon className="w-5 h-5 text-text-muted flex-shrink-0" />
                )}
              </button>

              {isExpanded && (
                <div className="px-6 pb-6 pt-2 border-t border-border-base/50">
                  {isResource ? (
                    <div className="grid md:grid-cols-1 gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <DocumentTextIcon className="w-4 h-4 text-primary" />
                          <span className="text-xs font-bold uppercase tracking-wider text-primary">Resource Content</span>
                        </div>
                        <div className="bg-app rounded-md border border-border-base p-4">
                          <p className="text-sm text-text-main whitespace-pre-wrap">{inputText}</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <DocumentTextIcon className="w-4 h-4 text-primary" />
                          <span className="text-xs font-bold uppercase tracking-wider text-primary">Input (Prompt)</span>
                        </div>
                        <div className="bg-app rounded-md border border-border-base p-4">
                          <p className="text-sm text-text-main whitespace-pre-wrap">{inputText}</p>
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          {isAntiPattern ? (
                            <>
                              <ExclamationTriangleIcon className="w-4 h-4 text-rose-500" />
                              <span className="text-xs font-bold uppercase tracking-wider text-rose-500">Anti-Pattern (Avoid This)</span>
                            </>
                          ) : (
                            <>
                              <CheckCircleIcon className="w-4 h-4 text-emerald-500" />
                              <span className="text-xs font-bold uppercase tracking-wider text-emerald-500">Expected Output</span>
                            </>
                          )}
                        </div>
                        <div className={`rounded-md p-4 ${isAntiPattern
                          ? 'bg-rose-500/5 border border-rose-500/20'
                          : 'bg-emerald-500/5 border border-emerald-500/20'}`}>
                          <p className="text-sm text-text-main whitespace-pre-wrap">{expectedText}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    )}
  </>
);

export default DatasetRowsPanel;
