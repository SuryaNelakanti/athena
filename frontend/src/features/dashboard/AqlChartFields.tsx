import { Select, Textarea } from '../../components/ui';
import { formatAql, SERIES_FIELDS, X_AXIS_FIELDS, Y_AXIS_FIELDS } from './aql';
import type { ChartDraft } from './aql';

type AqlChartFieldsProps = {
  chart: ChartDraft;
  onChartChange: (changes: Partial<ChartDraft>) => void;
};

export function AqlChartFields({ chart, onChartChange }: AqlChartFieldsProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold text-text-muted tracking-wide">X Axis Field</label>
          <Select value={chart.x_field} onChange={(event) => onChartChange({ x_field: event.target.value })} className="text-xs">
            {X_AXIS_FIELDS.map((field) => (
              <option key={field.value} value={field.value}>{field.label}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold text-text-muted tracking-wide">Y Axis Field</label>
          <Select value={chart.y_field} onChange={(event) => onChartChange({ y_field: event.target.value })} className="text-xs">
            {Y_AXIS_FIELDS.map((field) => (
              <option key={field.value} value={field.value}>{field.label}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold text-text-muted tracking-wide">Series Grouping</label>
          <Select value={chart.series_field} onChange={(event) => onChartChange({ series_field: event.target.value })} className="text-xs">
            {SERIES_FIELDS.map((field) => (
              <option key={field.value} value={field.value}>{field.label}</option>
            ))}
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between items-center">
          <label className="text-[10px] uppercase font-bold text-text-muted tracking-wide">AQL Query</label>
          <span className="text-[10px] text-text-muted">Fields: timestamp, latency_ms, cost, total_tokens, model, status</span>
        </div>
        <Textarea
          value={chart.query}
          onChange={(event) => onChartChange({ query: event.target.value })}
          onBlur={() => onChartChange({ query: formatAql(chart.query) })}
          placeholder={'AQL query (ex: from project_logs(project_id="...") select timestamp, total_tokens)'}
          className="font-mono text-xs h-28 resize-none"
        />
      </div>
    </div>
  );
}
