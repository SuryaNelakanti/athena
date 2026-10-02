import { Button, Card, Input, Select, Tabs } from '../../components/ui';
import type { ChartRow } from './metrics';
import { CHART_TEMPLATES, GUIDED_METRICS } from './aql';
import type { ChartDraft, ChartMode, GuidedChartConfig } from './aql';
import { AqlChartFields } from './AqlChartFields';
import { DashboardChartPreview } from './DashboardChartPreview';
import { GuidedChartFields } from './GuidedChartFields';

interface DashboardChartBuilderProps {
  chartMode: ChartMode;
  newChart: ChartDraft;
  guidedConfig: GuidedChartConfig;
  guidedMetric: (typeof GUIDED_METRICS)[number];
  guidedSummary: string;
  previewQueryText: string;
  previewRows: ChartRow[];
  previewError: string | null;
  previewLoading: boolean;
  chartError: string | null;
  isEditing: boolean;
  onModeChange: (mode: ChartMode) => void;
  onChartChange: (changes: Partial<ChartDraft>) => void;
  onGuidedConfigChange: (changes: Partial<GuidedChartConfig>) => void;
  onApplyTemplate: (template: (typeof CHART_TEMPLATES)[number]) => void;
  onPreview: () => void;
  onSave: () => void;
  onCancel: () => void;
}

export function DashboardChartBuilder({
  chartMode,
  newChart,
  guidedConfig,
  guidedMetric,
  guidedSummary,
  previewQueryText,
  previewRows,
  previewError,
  previewLoading,
  chartError,
  isEditing,
  onModeChange,
  onChartChange,
  onGuidedConfigChange,
  onApplyTemplate,
  onPreview,
  onSave,
  onCancel,
}: DashboardChartBuilderProps) {
  return (
    <Card className="p-6 mb-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-text-main">Chart Builder</h3>
          <p className="text-xs text-text-muted mt-1">
            Guided setup for non-coders, with full AQL access when you want to go deeper.
          </p>
        </div>
        <Tabs
          options={[
            { id: 'guided', label: 'Guided' },
            { id: 'advanced', label: 'AQL' },
          ]}
          value={chartMode}
          onChange={(value) => onModeChange(value as ChartMode)}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr,1fr] gap-6">
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-text-muted tracking-wide">Chart Name</label>
              <Input
                value={newChart.name}
                onChange={(event) => onChartChange({ name: event.target.value })}
                placeholder="e.g. Token usage over time"
                className="text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-text-muted tracking-wide">Chart Type</label>
              <Select
                value={newChart.chart_type}
                onChange={(event) => onChartChange({ chart_type: event.target.value })}
                className="text-xs"
              >
                <option value="line">Line</option>
                <option value="area">Area</option>
                <option value="bar">Bar</option>
              </Select>
            </div>
          </div>

          {chartMode === 'guided' ? (
            <GuidedChartFields
              config={guidedConfig}
              metric={guidedMetric}
              summary={guidedSummary}
              onConfigChange={onGuidedConfigChange}
              onApplyTemplate={onApplyTemplate}
            />
          ) : (
            <AqlChartFields chart={newChart} onChartChange={onChartChange} />
          )}
        </div>

        <DashboardChartPreview
          query={previewQueryText}
          rows={previewRows}
          error={previewError}
          loading={previewLoading}
          onPreview={onPreview}
        />
      </div>

      {chartError && (
        <div className="text-xs text-rose-500 font-bold bg-rose-500/10 rounded-md p-3">
          {chartError}
        </div>
      )}
      <div className="flex items-center gap-2">
        <Button variant="primary" size="sm" onClick={onSave}>
          {isEditing ? 'Update Chart' : 'Save Chart'}
        </Button>
        <Button onClick={onCancel} variant="secondary" size="sm">Cancel</Button>
      </div>
    </Card>
  );
}
