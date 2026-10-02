import { useEffect, useRef, useState } from 'react';
import { BeakerIcon } from '@heroicons/react/24/outline';
import { api } from '../../lib/api';
import { getErrorMessage } from '../../lib/errors';
import type {
  ExperimentComparisonResult,
  ExperimentRun,
  ExperimentVersion,
  Function,
  ScorerConfig,
} from '../../types';
import { Button, Card, Select } from '../../components/ui';
import { formatDateTime } from './formatting';
import { ExperimentComparisonPanel, type ExperimentComparisonFilter } from './ExperimentComparisonPanel';

interface ExperimentComparisonWorkspaceProps {
  visible: boolean;
  experimentId: string;
  initialVersionId: string | null;
  versions: ExperimentVersion[];
  scorers: ScorerConfig[];
  scorerIndex: Map<string, Function>;
  onErrorChange: (message: string | null) => void;
}

export function ExperimentComparisonWorkspace({
  visible,
  experimentId,
  initialVersionId,
  versions,
  scorers,
  scorerIndex,
  onErrorChange,
}: ExperimentComparisonWorkspaceProps) {
  const [baselineVersionId, setBaselineVersionId] = useState<string | null>(null);
  const [candidateVersionId, setCandidateVersionId] = useState<string | null>(null);
  const [baselineRuns, setBaselineRuns] = useState<ExperimentRun[]>([]);
  const [candidateRuns, setCandidateRuns] = useState<ExperimentRun[]>([]);
  const [baselineRunId, setBaselineRunId] = useState<string | null>(null);
  const [candidateRunId, setCandidateRunId] = useState<string | null>(null);
  const [comparison, setComparison] = useState<ExperimentComparisonResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ExperimentComparisonFilter>('all');
  const comparisonRequest = useRef(0);

  useEffect(() => {
    setBaselineVersionId(null);
    setCandidateVersionId(null);
    setBaselineRunId(null);
    setCandidateRunId(null);
    setBaselineRuns([]);
    setCandidateRuns([]);
    setComparison(null);
    setStatusFilter('all');
  }, [experimentId]);

  useEffect(() => {
    if (!initialVersionId) return;
    setBaselineVersionId((current) => current ?? initialVersionId);
    setCandidateVersionId((current) => current ?? initialVersionId);
  }, [experimentId, initialVersionId]);

  useEffect(() => {
    if (!baselineVersionId) {
      setBaselineRuns([]);
      setBaselineRunId(null);
      return;
    }

    let active = true;
    setBaselineRuns([]);
    setBaselineRunId(null);
    api.getVersionRuns(experimentId, baselineVersionId)
      .then((items) => {
        if (!active) return;
        setBaselineRuns(items);
        setBaselineRunId(items[0]?.id ?? null);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setBaselineRuns([]);
        setBaselineRunId(null);
        onErrorChange(getErrorMessage(cause, 'Failed to load baseline runs'));
      });

    return () => {
      active = false;
    };
  }, [experimentId, baselineVersionId, onErrorChange]);

  useEffect(() => {
    if (!candidateVersionId) {
      setCandidateRuns([]);
      setCandidateRunId(null);
      return;
    }

    let active = true;
    setCandidateRuns([]);
    setCandidateRunId(null);
    api.getVersionRuns(experimentId, candidateVersionId)
      .then((items) => {
        if (!active) return;
        setCandidateRuns(items);
        setCandidateRunId(items[0]?.id ?? null);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setCandidateRuns([]);
        setCandidateRunId(null);
        onErrorChange(getErrorMessage(cause, 'Failed to load candidate runs'));
      });

    return () => {
      active = false;
    };
  }, [experimentId, candidateVersionId, onErrorChange]);

  useEffect(() => {
    comparisonRequest.current += 1;
    setComparison(null);
    setLoading(false);
  }, [experimentId, initialVersionId, baselineVersionId, baselineRunId, candidateVersionId, candidateRunId]);

  useEffect(() => () => {
    comparisonRequest.current += 1;
  }, []);

  const compareRuns = async () => {
    if (!baselineRunId || !candidateRunId) return;

    const requestId = comparisonRequest.current + 1;
    comparisonRequest.current = requestId;
    setLoading(true);
    onErrorChange(null);

    try {
      const result = await api.compareExperimentRuns(experimentId, baselineRunId, candidateRunId);
      if (comparisonRequest.current === requestId) setComparison(result);
    } catch (cause: unknown) {
      if (comparisonRequest.current === requestId) {
        onErrorChange(getErrorMessage(cause, 'Failed to compare runs'));
      }
    } finally {
      if (comparisonRequest.current === requestId) setLoading(false);
    }
  };

  return (
    <div className={visible ? 'space-y-4' : 'hidden'}>
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-widest text-text-muted font-semibold">Baseline</div>
            <Select value={baselineVersionId ?? ''} onChange={(event) => setBaselineVersionId(event.target.value || null)}>
              <option value="">Select version</option>
              {versions.map((version) => (
                <option key={version.id} value={version.id}>v{version.version_number}</option>
              ))}
            </Select>
            <Select value={baselineRunId ?? ''} onChange={(event) => setBaselineRunId(event.target.value || null)}>
              <option value="">Select run</option>
              {baselineRuns.map((run) => (
                <option key={run.id} value={run.id}>{formatDateTime(run.created_at)} - {run.status}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-widest text-text-muted font-semibold">Candidate</div>
            <Select value={candidateVersionId ?? ''} onChange={(event) => setCandidateVersionId(event.target.value || null)}>
              <option value="">Select version</option>
              {versions.map((version) => (
                <option key={version.id} value={version.id}>v{version.version_number}</option>
              ))}
            </Select>
            <Select value={candidateRunId ?? ''} onChange={(event) => setCandidateRunId(event.target.value || null)}>
              <option value="">Select run</option>
              {candidateRuns.map((run) => (
                <option key={run.id} value={run.id}>{formatDateTime(run.created_at)} - {run.status}</option>
              ))}
            </Select>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-end">
          <Button variant="primary" size="sm" onClick={compareRuns} disabled={!baselineRunId || !candidateRunId || loading}>
            <BeakerIcon className="w-4 h-4" /> {loading ? 'Comparing...' : 'Compare'}
          </Button>
        </div>
      </Card>

      {comparison && (
        <ExperimentComparisonPanel
          result={comparison}
          filter={statusFilter}
          scorers={scorers}
          scorerIndex={scorerIndex}
          onFilterChange={setStatusFilter}
        />
      )}
    </div>
  );
}
