import { Badge, Input, Select } from '../../components/ui';
import {
  CHART_TEMPLATES,
  GUIDED_AXIS_FIELDS,
  GUIDED_BREAKDOWN_FIELDS,
  GUIDED_METRICS,
  GUIDED_PROVIDER_FILTERS,
  GUIDED_STATUS_FILTERS,
  GUIDED_TIME_RANGES,
} from './aql';
import type { GuidedChartConfig } from './aql';

type GuidedChartMetric = (typeof GUIDED_METRICS)[number];
type ChartTemplate = (typeof CHART_TEMPLATES)[number];

type GuidedChartFieldsProps = {
  config: GuidedChartConfig;
  metric: GuidedChartMetric;
  summary: string;
  onConfigChange: (changes: Partial<GuidedChartConfig>) => void;
  onApplyTemplate: (template: ChartTemplate) => void;
};

export function GuidedChartFields({
  config,
  metric,
  summary,
  onConfigChange,
  onApplyTemplate,
}: GuidedChartFieldsProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {CHART_TEMPLATES.map((template) => (
          <button
            key={template.id}
            type="button"
            onClick={() => onApplyTemplate(template)}
            className="rounded-lg border border-border-base bg-panel/60 p-3 text-left hover:border-primary/40 hover:bg-panel-hover transition"
          >
            <div className="text-xs font-semibold text-text-main">{template.name}</div>
            <div className="text-[11px] text-text-muted mt-1">{template.description}</div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold text-text-muted tracking-wide">Metric</label>
          <Select value={config.metric} onChange={(event) => onConfigChange({ metric: event.target.value })} className="text-xs">
            {GUIDED_METRICS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </Select>
          <div className="text-[11px] text-text-muted">{metric.description}</div>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold text-text-muted tracking-wide">Time Range</label>
          <Select value={config.timeRange} onChange={(event) => onConfigChange({ timeRange: event.target.value })} className="text-xs">
            {GUIDED_TIME_RANGES.map((range) => (
              <option key={range.id} value={range.id}>{range.label}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold text-text-muted tracking-wide">X Axis</label>
          <Select value={config.xAxis} onChange={(event) => onConfigChange({ xAxis: event.target.value })} className="text-xs">
            {GUIDED_AXIS_FIELDS.map((field) => (
              <option key={field.value} value={field.value}>{field.label}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold text-text-muted tracking-wide">Breakdown</label>
          <Select value={config.breakdown} onChange={(event) => onConfigChange({ breakdown: event.target.value })} className="text-xs">
            {GUIDED_BREAKDOWN_FIELDS.map((field) => (
              <option key={field.value} value={field.value}>{field.label}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold text-text-muted tracking-wide">Status Filter</label>
          <Select value={config.statusFilter} onChange={(event) => onConfigChange({ statusFilter: event.target.value })} className="text-xs">
            {GUIDED_STATUS_FILTERS.map((field) => (
              <option key={field.value} value={field.value}>{field.label}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold text-text-muted tracking-wide">Provider Filter</label>
          <Select value={config.providerFilter} onChange={(event) => onConfigChange({ providerFilter: event.target.value })} className="text-xs">
            {GUIDED_PROVIDER_FILTERS.map((field) => (
              <option key={field.value} value={field.value}>{field.label}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold text-text-muted tracking-wide">Result Limit</label>
          <Input
            type="number"
            min={10}
            value={config.limit}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (Number.isFinite(next) && next > 0) {
                onConfigChange({ limit: next });
              }
            }}
            className="text-xs"
          />
        </div>
      </div>

      <div className="rounded-lg border border-border-base bg-panel/60 p-4">
        <div className="text-[10px] uppercase font-bold text-text-muted tracking-wide">Summary</div>
        <p className="text-xs text-text-main mt-2">{summary}</p>
        <div className="flex flex-wrap gap-2 mt-3">
          <Badge variant="neutral">X: {GUIDED_AXIS_FIELDS.find((field) => field.value === config.xAxis)?.label}</Badge>
          <Badge variant="neutral">Y: {metric.label}</Badge>
          {config.breakdown && (
            <Badge variant="neutral">Split: {GUIDED_BREAKDOWN_FIELDS.find((field) => field.value === config.breakdown)?.label}</Badge>
          )}
        </div>
      </div>
    </div>
  );
}
