import { Button, Textarea } from '../../components/ui';
import type { SessionEval } from '../../types';

type RunEvaluationPanelsProps = {
  sessionEval: SessionEval | null;
  loading: boolean;
  running: boolean;
  error: string | null;
  expected: string;
  criteria: string;
  useJudge: boolean;
  scoreEntries: Array<[string, number]>;
  failingNodeCount: number;
  onExpectedChange: (value: string) => void;
  onCriteriaChange: (value: string) => void;
  onUseJudgeChange: (enabled: boolean) => void;
  onRun: () => void | Promise<void>;
};

export function RunEvaluationPanels({
  sessionEval,
  loading,
  running,
  error,
  expected,
  criteria,
  useJudge,
  scoreEntries,
  failingNodeCount,
  onExpectedChange,
  onCriteriaChange,
  onUseJudgeChange,
  onRun,
}: RunEvaluationPanelsProps) {
  const showSummary = Boolean(sessionEval || loading || error);

  return (
    <>
      <div className="p-4 rounded-xl border border-border-hairline bg-panel/60 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-text-muted font-bold">Eval Config</div>
            <div className="text-sm font-semibold text-text-main">Session scoring</div>
          </div>
          <Button variant="primary" size="sm" onClick={onRun} disabled={running}>
            {running ? 'Running...' : 'Run Eval'}
          </Button>
        </div>
        <div className="space-y-2">
          <label className="text-[10px] uppercase tracking-widest text-text-muted font-bold">
            Expected Answer
          </label>
          <Textarea
            value={expected}
            onChange={(event) => onExpectedChange(event.target.value)}
            rows={3}
            placeholder="Expected answer (enables outcome scoring)"
          />
          <p className="text-xs text-text-muted">
            Providing an expected answer enables deterministic outcome scoring.
          </p>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[10px] uppercase tracking-widest text-text-muted font-bold">
              LLM Judge
            </label>
            <label className="flex items-center gap-2 text-xs text-text-muted">
              <input
                type="checkbox"
                checked={useJudge}
                onChange={(event) => onUseJudgeChange(event.target.checked)}
                className="h-3.5 w-3.5 rounded border-border-base bg-panel"
              />
              Enable
            </label>
          </div>
          <Textarea
            value={criteria}
            onChange={(event) => onCriteriaChange(event.target.value)}
            rows={2}
            placeholder="Criteria (ex: accuracy, helpfulness, policy compliance)"
            disabled={!useJudge}
            className={!useJudge ? 'opacity-60' : ''}
          />
        </div>
      </div>

      {showSummary && (
        <div className="p-4 rounded-xl border border-border-hairline bg-panel/60 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-text-muted font-bold">
                Session Eval
              </div>
              <div className="text-sm font-semibold text-text-main">
                {sessionEval ? `v${sessionEval.version}` : 'Not run yet'}
              </div>
            </div>
            <div className="text-xs text-text-muted">
              {loading
                ? 'Loading...'
                : sessionEval?.created_at
                  ? new Date(sessionEval.created_at).toLocaleString()
                  : ''}
            </div>
          </div>
          {error && (
            <div className="text-xs text-rose-600 bg-rose-100/70 border border-rose-200 rounded-md p-2">
              {error}
            </div>
          )}
          {sessionEval && (
            <>
              <div className="text-xs text-text-muted">
                Avg score: {typeof sessionEval.summary?.avg_score === 'number'
                  ? sessionEval.summary.avg_score.toFixed(2)
                  : 'n/a'}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {scoreEntries.map(([key, value]) => (
                  <div key={key} className="p-2 rounded-lg border border-border-hairline bg-app/70">
                    <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold">
                      {key.replace('_', ' ')}
                    </div>
                    <div className="text-sm font-mono text-text-main">{value.toFixed(2)}</div>
                  </div>
                ))}
              </div>
              <div className="text-xs text-text-muted">Failing nodes: {failingNodeCount}</div>
            </>
          )}
        </div>
      )}
    </>
  );
}
