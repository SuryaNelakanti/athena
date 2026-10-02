import { Button, Textarea } from '../../components/ui';
import type { ChartRow } from './metrics';
import { formatAql } from './aql';

type DashboardChartPreviewProps = {
  query: string;
  rows: ChartRow[];
  error: string | null;
  loading: boolean;
  onPreview: () => void;
};

export function DashboardChartPreview({ query, rows, error, loading, onPreview }: DashboardChartPreviewProps) {
  const columns = rows.length ? Object.keys(rows[0]).slice(0, 4) : [];
  const sample = rows.slice(0, 6);

  return (
    <div className="rounded-lg border border-border-base bg-panel/60 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold text-text-main">Preview</div>
          <div className="text-[11px] text-text-muted">Check the output before you save.</div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={onPreview}
          disabled={!query.trim() || loading}
        >
          {loading ? 'Running...' : 'Preview data'}
        </Button>
      </div>
      <div className="space-y-1">
        <label className="text-[10px] uppercase font-bold text-text-muted tracking-wide">Generated AQL</label>
        <Textarea
          value={formatAql(query)}
          readOnly
          className="font-mono text-xs h-32 resize-none bg-panel"
        />
      </div>
      {error && (
        <div className="text-xs text-rose-500 font-bold bg-rose-500/10 rounded-md p-3">
          {error}
        </div>
      )}
      {!loading && !error && sample.length === 0 && (
        <div className="text-[11px] text-text-muted italic">Run a preview to see sample rows.</div>
      )}
      {sample.length > 0 && (
        <div className="overflow-auto border border-border-base rounded-md">
          <table className="w-full text-[11px]">
            <thead className="bg-panel-hover text-text-muted">
              <tr>
                {columns.map((column) => (
                  <th key={column} className="px-2 py-2 text-left font-semibold">{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sample.map((row, index) => (
                <tr key={index} className="border-t border-border-base text-text-main">
                  {columns.map((column) => (
                    <td key={column} className="px-2 py-2">
                      {row[column] !== null && row[column] !== undefined ? String(row[column]) : '--'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
