import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import { Experiment, ExperimentRun, ExperimentRunResult, ExperimentVersion, ModelRegistry, Function, DatasetRow } from '../types';
import {
  ChevronLeftIcon, PlusIcon, PlayIcon, StopIcon, StarIcon,
  BeakerIcon, ChevronDownIcon, ChevronRightIcon,
  CheckCircleIcon, XCircleIcon, ClockIcon
} from '@heroicons/react/24/outline';

interface ExperimentDetailProps {
  experiment: Experiment;
  onBack: () => void;
}

function formatDateTime(ms?: number | null) {
  if (!ms) return '-';
  return new Date(ms).toLocaleString();
}

// Default descriptions for scorers when not provided by backend
function getDefaultScorerDescription(name: string): string {
  const descriptions: Record<string, string> = {
    'exact_match': 'Checks if the AI output exactly matches the expected answer (case-insensitive, normalized whitespace).',
    'contains': 'Checks if the expected answer appears somewhere within the AI output.',
    'regex_match': 'Matches the AI output against a regular expression pattern.',
    'llm_judge': 'Uses an LLM to evaluate the quality and correctness of the output on a scale of 1-5.',
    'anti_pattern_check': 'Checks if the output resembles any known bad patterns or anti-examples.',
  };
  return descriptions[name] || 'Evaluates the AI output.';
}

const ExperimentDetail: React.FC<ExperimentDetailProps> = ({ experiment, onBack }) => {
  const [exp, setExp] = useState<Experiment>(experiment);
  const [models, setModels] = useState<ModelRegistry[]>([]);
  const [scorers, setScorers] = useState<Function[]>([]);
  const [versions, setVersions] = useState<ExperimentVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [datasetRows, setDatasetRows] = useState<DatasetRow[]>([]);

  const [runs, setRuns] = useState<ExperimentRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [results, setResults] = useState<ExperimentRunResult[]>([]);
  const [expandedResultId, setExpandedResultId] = useState<string | null>(null);
  const [compareBaselineId, setCompareBaselineId] = useState<string | null>(null);
  const [compareCandidateId, setCompareCandidateId] = useState<string | null>(null);
  const [compareResult, setCompareResult] = useState<any | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreateVersion, setShowCreateVersion] = useState(false);
  const [newVersion, setNewVersion] = useState({
    parent_version_id: '',
    model_registry_id: '',
    temperature: 1.0,
    max_tokens: '',
    top_p: '',
    frequency_penalty: '',
    presence_penalty: '',
    system_prompt: '',
    notes: '',
    scorers: ['exact_match'] as string[],
  });

  const mainVersionId = (exp.summary as any)?.main_version_id as string | undefined;

  useEffect(() => setExp(experiment), [experiment]);

  const refreshAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [modelsData, versionsData, scorersData] = await Promise.all([
        api.getModelRegistry(true),
        api.getExperimentVersions(exp.id),
        api.getScorers(),
      ]);
      setModels(modelsData);
      setVersions(versionsData);
      setScorers(scorersData.filter((s: Function) => s.type === 'scorer' && s.enabled));

      // Load dataset rows for context
      if (exp.dataset_id) {
        const rows = await api.getDatasetRows(exp.dataset_id);
        setDatasetRows(rows);
      }

      const initialVersionId = mainVersionId || versionsData[0]?.id || null;
      setSelectedVersionId((prev) => prev || initialVersionId);

      setNewVersion((prev) => ({
        ...prev,
        model_registry_id: prev.model_registry_id || modelsData[0]?.id || '',
        parent_version_id: prev.parent_version_id || initialVersionId || '',
      }));
    } catch (e: any) {
      setError(e?.message || 'Failed to load experiment data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshAll();
  }, [exp.id]);

  const refreshRuns = async (versionId: string) => {
    const data = await api.getVersionRuns(exp.id, versionId);
    setRuns(data);
    if (!selectedRunId && data.length > 0) setSelectedRunId(data[0].id);
  };

  useEffect(() => {
    if (!selectedVersionId) {
      setRuns([]);
      setSelectedRunId(null);
      return;
    }
    setLoading(true);
    refreshRuns(selectedVersionId)
      .catch((e: any) => setError(e?.message || 'Failed to load runs'))
      .finally(() => setLoading(false));
  }, [selectedVersionId]);

  useEffect(() => {
    setCompareResult(null);
  }, [selectedVersionId]);

  const selectedRun = useMemo(() => runs.find((r) => r.id === selectedRunId) || null, [runs, selectedRunId]);
  const selectedVersion = useMemo(() => versions.find((v) => v.id === selectedVersionId) || null, [versions, selectedVersionId]);
  const selectedModel = useMemo(() => {
    const regId = (selectedVersion?.config as any)?.model?.registry_id;
    return models.find((m) => m.id === regId) || null;
  }, [selectedVersion, models]);

  useEffect(() => {
    if (runs.length === 0) return;
    const candidateId = selectedRunId || runs[0].id;
    if (!compareCandidateId) setCompareCandidateId(candidateId);
    if (!compareBaselineId) {
      const other = runs.find((r) => r.id !== candidateId);
      setCompareBaselineId(other ? other.id : candidateId);
    }
  }, [runs, selectedRunId, compareBaselineId, compareCandidateId]);

  useEffect(() => {
    if (!selectedRunId) {
      setResults([]);
      return;
    }
    setLoading(true);
    api.getRunResults(selectedRunId)
      .then(setResults)
      .catch((e: any) => setError(e?.message || 'Failed to load results'))
      .finally(() => setLoading(false));
  }, [selectedRunId]);

  // Polling for running experiments
  useEffect(() => {
    if (!selectedRunId || !selectedRun) return;
    if (!(selectedRun.status === 'queued' || selectedRun.status === 'running')) return;

    const interval = window.setInterval(async () => {
      try {
        const updated = await api.getRun(selectedRunId);
        setRuns((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
        if (updated.status === 'completed' || updated.status === 'error' || updated.status === 'canceled') {
          const latestResults = await api.getRunResults(selectedRunId);
          setResults(latestResults);
          window.clearInterval(interval);
        }
      } catch {
        // ignore poll errors
      }
    }, 1200);

    return () => window.clearInterval(interval);
  }, [selectedRunId, selectedRun]);

  const createVersion = async () => {
    setError(null);
    if (!newVersion.model_registry_id) return;
    setLoading(true);
    try {
      const created = await api.createExperimentVersion(exp.id, {
        parent_version_id: newVersion.parent_version_id || undefined,
        model_registry_id: newVersion.model_registry_id,
        temperature: Number(newVersion.temperature) || 1.0,
        max_tokens: newVersion.max_tokens ? Number(newVersion.max_tokens) : undefined,
        top_p: newVersion.top_p ? Number(newVersion.top_p) : undefined,
        frequency_penalty: newVersion.frequency_penalty ? Number(newVersion.frequency_penalty) : undefined,
        presence_penalty: newVersion.presence_penalty ? Number(newVersion.presence_penalty) : undefined,
        system_prompt: newVersion.system_prompt || '',
        notes: newVersion.notes || '',
        scorers: newVersion.scorers.length > 0 ? newVersion.scorers : ['exact_match'],
      });
      const refreshedVersions = await api.getExperimentVersions(exp.id);
      setVersions(refreshedVersions);
      setSelectedVersionId(created.id);
      setShowCreateVersion(false);
      if (!mainVersionId) {
        const updatedExp = await api.getExperiment(exp.id);
        setExp(updatedExp);
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to create version');
    } finally {
      setLoading(false);
    }
  };

  const setMain = async (versionId: string) => {
    setError(null);
    try {
      const updated = await api.setExperimentMainVersion(exp.id, versionId);
      setExp(updated);
    } catch (e: any) {
      setError(e?.message || 'Failed to set main version');
    }
  };

  const runVersion = async () => {
    if (!selectedVersionId) return;
    setError(null);
    setLoading(true);
    try {
      const run = await api.createVersionRun(exp.id, selectedVersionId);
      await refreshRuns(selectedVersionId);
      setSelectedRunId(run.id);
    } catch (e: any) {
      setError(e?.message || 'Failed to start run');
    } finally {
      setLoading(false);
    }
  };

  const cancelRun = async (runId: string) => {
    setError(null);
    try {
      const updated = await api.cancelRun(runId);
      setRuns((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    } catch (e: any) {
      setError(e?.message || 'Failed to cancel run');
    }
  };

  const runCompare = async () => {
    if (!compareBaselineId || !compareCandidateId) return;
    setCompareLoading(true);
    setError(null);
    try {
      const data = await api.compareExperimentRuns(exp.id, compareBaselineId, compareCandidateId);
      setCompareResult(data);
    } catch (e: any) {
      setError(e?.message || 'Failed to compare runs');
    } finally {
      setCompareLoading(false);
    }
  };

  // Helper to extract text from input/expected
  const extractText = (obj: any): string => {
    if (typeof obj === 'string') return obj;
    if (!obj || typeof obj !== 'object') return '';
    for (const key of ['prompt', 'input', 'text', 'query', 'question', 'content']) {
      if (typeof obj[key] === 'string') return obj[key];
    }
    if (Array.isArray(obj.messages)) {
      const userMsg = obj.messages.find((m: any) => m.role === 'user');
      if (userMsg?.content) return userMsg.content;
    }
    return JSON.stringify(obj);
  };

  const extractExpected = (obj: any): string => {
    if (typeof obj === 'string') return obj;
    if (!obj || typeof obj !== 'object') return '';
    for (const key of ['answer', 'expected', 'text', 'content', 'response']) {
      if (typeof obj[key] === 'string') return obj[key];
    }
    return JSON.stringify(obj);
  };

  // Get dataset row for a result
  const getRowForResult = (result: ExperimentRunResult): DatasetRow | null => {
    return datasetRows.find(r => r.id === result.dataset_row_id) || null;
  };

  // Calculate score color
  const getScoreColor = (score: number | undefined): string => {
    if (score === undefined) return 'text-text-muted';
    if (score >= 0.8) return 'text-emerald-500';
    if (score >= 0.5) return 'text-amber-500';
    return 'text-rose-500';
  };

  const getScoreBg = (score: number | undefined): string => {
    if (score === undefined) return 'bg-text-muted/10';
    if (score >= 0.8) return 'bg-emerald-500/10 border-emerald-500/20';
    if (score >= 0.5) return 'bg-amber-500/10 border-amber-500/20';
    return 'bg-rose-500/10 border-rose-500/20';
  };

  const pickScore = (scores: Record<string, any> | undefined): number | undefined => {
    if (!scores) return undefined;
    const preferred = ['exact_match', 'llm_judge', 'contains'];
    for (const key of preferred) {
      const value = scores[key];
      if (typeof value === 'number') return value;
    }
    const firstNumeric = Object.values(scores).find((v) => typeof v === 'number');
    return typeof firstNumeric === 'number' ? firstNumeric : undefined;
  };

  const formatDelta = (value: number | undefined) => {
    if (value === undefined) return '-';
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toFixed(3)}`;
  };

  return (
    <div className="h-full flex flex-col bg-app transition-colors duration-300">
      {/* Header */}
      <div className="border-b border-border-base bg-panel shrink-0">
        <div className="px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button onClick={onBack} className="p-2 -ml-2 rounded-xl text-text-muted hover:text-text-main hover:bg-panel-hover transition-all">
                <ChevronLeftIcon className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                  <BeakerIcon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-serif font-black text-text-main leading-tight">{exp.name}</h2>
                  <div className="flex items-center gap-2 text-xs text-text-muted font-medium mt-0.5">
                    <span>{versions.length} versions</span>
                    <span>•</span>
                    <span>{datasetRows.length} test cases</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowCreateVersion(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-panel border border-border-base rounded-xl text-sm font-bold text-text-main hover:bg-panel-hover transition-all"
              >
                <PlusIcon className="w-4 h-4" /> New Version
              </button>
              <button
                onClick={runVersion}
                disabled={!selectedVersionId}
                className="flex items-center gap-2 px-4 py-2.5 bg-wispr-purple text-white rounded-xl text-sm font-bold shadow-lg shadow-wispr-purple/20 hover:bg-wispr-purple-dark transition-all disabled:opacity-50"
              >
                <PlayIcon className="w-4 h-4" /> Run Experiment
              </button>
            </div>
          </div>
        </div>

        {/* Explanation Banner */}
        <div className="px-8 pb-4">
          <div className="bg-gradient-to-r from-amber-500/5 to-transparent border border-amber-500/20 rounded-xl p-4">
            <h4 className="text-sm font-bold text-text-main mb-1">🧪 What is an Experiment?</h4>
            <p className="text-xs text-text-muted leading-relaxed">
              An experiment tests your AI by running it against a <strong className="text-text-main">dataset</strong>.
              For each test case, the AI receives the <strong className="text-wispr-purple">Input</strong>, generates an <strong className="text-amber-500">Actual Output</strong>,
              which is then compared against the <strong className="text-emerald-500">Expected Output</strong> using scorers.
              Create different versions to try different models, prompts, or parameters.
            </p>
          </div>
        </div>
      </div>

      {error && <div className="px-8 py-3 bg-rose-500/10 border-b border-rose-500/20 text-xs text-rose-500 font-bold">{error}</div>}

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Versions */}
        <div className="w-64 border-r border-border-base bg-panel overflow-y-auto shrink-0">
          <div className="p-4 border-b border-border-base">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Versions</h3>
          </div>
          <div className="p-2 space-y-1">
            {versions.map((v) => {
              const model = models.find((m) => m.id === (v.config as any)?.model?.registry_id);
              const isMain = v.id === mainVersionId;
              const isSelected = v.id === selectedVersionId;

              return (
                <button
                  key={v.id}
                  onClick={() => setSelectedVersionId(v.id)}
                  className={`w-full text-left p-3 rounded-xl transition-all ${isSelected ? 'bg-wispr-purple/10 border border-wispr-purple/30' : 'hover:bg-panel-hover border border-transparent'
                    }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-bold ${isSelected ? 'text-wispr-purple' : 'text-text-main'}`}>
                      v{v.version_number}
                    </span>
                    {isMain && (
                      <span className="flex items-center gap-1 text-[9px] bg-amber-500/20 text-amber-600 px-1.5 py-0.5 rounded-full font-bold">
                        <StarIcon className="w-3 h-3" /> Main
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-text-muted truncate mt-1">
                    {model ? `${model.provider}:${model.model_id}` : '—'}
                  </div>
                  <div className="text-[10px] text-text-muted opacity-60 truncate mt-0.5">
                    {(v.config as any)?.notes || 'No notes'}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Selected Version Info */}
          {selectedVersion && (
            <div className="bg-panel border border-border-base rounded-2xl p-5 mb-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold text-text-main">v{selectedVersion.version_number}</span>
                  <span className="text-xs text-text-muted">{selectedModel?.display_name || selectedModel?.model_id}</span>
                </div>
                {selectedVersionId !== mainVersionId && (
                  <button
                    onClick={() => setMain(selectedVersionId!)}
                    className="text-xs text-wispr-purple hover:text-wispr-purple-dark font-bold"
                  >
                    Set as Main
                  </button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-4 text-xs">
                <div>
                  <span className="text-text-muted">Temperature:</span>
                  <span className="ml-1 text-text-main font-medium">{(selectedVersion.config as any)?.model?.temperature || 1.0}</span>
                </div>
                <div>
                  <span className="text-text-muted">Scorers:</span>
                  <span className="ml-1 text-text-main font-medium">
                    {((selectedVersion.config as any)?.scorers || []).map((s: any) => s.type).join(', ') || 'exact_match'}
                  </span>
                </div>
                <div>
                  <span className="text-text-muted">System Prompt:</span>
                  <span className="ml-1 text-text-main font-medium truncate">
                    {((selectedVersion.config as any)?.task?.system_prompt || '').substring(0, 50) || 'None'}...
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Runs */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-text-main">Runs</h3>
              {selectedRun && (selectedRun.status === 'running' || selectedRun.status === 'queued') && (
                <div className="flex items-center gap-2 text-xs text-amber-500">
                  <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  Running... {selectedRun.summary?.rows_done || 0}/{selectedRun.summary?.rows_total || 0}
                </div>
              )}
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {runs.map((r) => {
                const avgScore = Number(r.summary?.avg_score || 0);
                const isSelected = r.id === selectedRunId;

                return (
                  <button
                    key={r.id}
                    onClick={() => setSelectedRunId(r.id)}
                    className={`flex-shrink-0 p-3 rounded-xl border transition-all ${isSelected
                      ? 'bg-wispr-purple/10 border-wispr-purple/30'
                      : 'bg-panel border-border-base hover:border-border-hover'
                      }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {r.status === 'completed' && <CheckCircleIcon className="w-4 h-4 text-emerald-500" />}
                      {r.status === 'error' && <XCircleIcon className="w-4 h-4 text-rose-500" />}
                      {r.status === 'running' && <ClockIcon className="w-4 h-4 text-amber-500 animate-spin" />}
                      {r.status === 'queued' && <ClockIcon className="w-4 h-4 text-text-muted" />}
                      {r.status === 'canceled' && <StopIcon className="w-4 h-4 text-text-muted" />}
                      <span className={`text-xs font-bold ${isSelected ? 'text-wispr-purple' : 'text-text-main'}`}>
                        {new Date(r.created_at).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="text-lg font-black text-text-main tabular-nums">
                      {(avgScore * 100).toFixed(0)}%
                    </div>
                    <div className="text-[10px] text-text-muted mt-0.5">
                      {r.summary?.rows_done || 0} results
                    </div>
                  </button>
                );
              })}
              {runs.length === 0 && (
                <div className="text-sm text-text-muted italic py-4">No runs yet. Click "Run Experiment" to start.</div>
              )}
            </div>
          </div>

          {/* Compare */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-text-main">Compare</h3>
              <button
                onClick={runCompare}
                disabled={!compareBaselineId || !compareCandidateId}
                className="px-3 py-2 bg-panel border border-border-base rounded-xl text-xs font-bold text-text-muted hover:text-text-main hover:bg-panel-hover disabled:opacity-50"
              >
                Compare Runs
              </button>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-text-muted mb-2">Baseline Run</label>
                <select
                  value={compareBaselineId || ''}
                  onChange={(e) => setCompareBaselineId(e.target.value)}
                  className="w-full bg-app border border-border-base rounded-xl px-4 py-2.5 text-sm text-text-main"
                >
                  <option value="">Select baseline...</option>
                  {runs.map((r) => (
                    <option key={r.id} value={r.id}>
                      {new Date(r.created_at).toLocaleString()} ({r.status})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-text-muted mb-2">Candidate Run</label>
                <select
                  value={compareCandidateId || ''}
                  onChange={(e) => setCompareCandidateId(e.target.value)}
                  className="w-full bg-app border border-border-base rounded-xl px-4 py-2.5 text-sm text-text-main"
                >
                  <option value="">Select candidate...</option>
                  {runs.map((r) => (
                    <option key={r.id} value={r.id}>
                      {new Date(r.created_at).toLocaleString()} ({r.status})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {compareLoading && (
              <div className="mt-4 text-xs text-text-muted italic">Computing comparison...</div>
            )}

            {compareResult && (
              <div className="mt-4 space-y-4">
                <div className="grid md:grid-cols-4 gap-3">
                  {['avg_score', 'cost_total', 'latency_ms_total', 'tokens_total'].map((key) => (
                    <div key={key} className="bg-panel border border-border-base rounded-xl p-3">
                      <div className="text-[10px] uppercase tracking-wider text-text-muted">{key}</div>
                      <div className="text-sm font-bold text-text-main">
                        {formatDelta(compareResult.delta_summary?.[key])}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="bg-panel border border-border-base rounded-2xl overflow-hidden">
                  <div className="grid grid-cols-12 gap-3 px-4 py-2 text-[10px] uppercase tracking-wider text-text-muted border-b border-border-base">
                    <div className="col-span-5">Input</div>
                    <div className="col-span-2 text-right">Baseline</div>
                    <div className="col-span-2 text-right">Candidate</div>
                    <div className="col-span-2 text-right">Delta</div>
                    <div className="col-span-1 text-right">Row</div>
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {(compareResult.rows || []).map((row: any, idx: number) => {
                      const baseScore = pickScore(row.baseline?.scores);
                      const candScore = pickScore(row.candidate?.scores);
                      const deltaScore = (typeof baseScore === 'number' && typeof candScore === 'number')
                        ? candScore - baseScore
                        : undefined;

                      return (
                        <div key={`${row.dataset_row_id}-${idx}`} className="grid grid-cols-12 gap-3 px-4 py-3 text-xs border-b border-border-base/60">
                          <div className="col-span-5 text-text-main line-clamp-2">
                            {row.input ? JSON.stringify(row.input) : 'Unknown input'}
                          </div>
                          <div className="col-span-2 text-right text-text-muted tabular-nums">
                            {baseScore !== undefined ? (baseScore * 100).toFixed(0) + '%' : '-'}
                          </div>
                          <div className="col-span-2 text-right text-text-muted tabular-nums">
                            {candScore !== undefined ? (candScore * 100).toFixed(0) + '%' : '-'}
                          </div>
                          <div className="col-span-2 text-right text-text-main tabular-nums">
                            {deltaScore !== undefined ? formatDelta(deltaScore) : '-'}
                          </div>
                          <div className="col-span-1 text-right text-text-muted tabular-nums">
                            {idx + 1}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Results */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-text-main">Results</h3>
              {results.length > 0 && (
                <span className="text-xs text-text-muted">
                  {results.filter(r => (r.scores?.exact_match || 0) >= 0.8).length}/{results.length} passing
                </span>
              )}
            </div>

            {results.length === 0 ? (
              <div className="bg-panel border border-border-base rounded-2xl p-10 text-center">
                <BeakerIcon className="w-12 h-12 text-text-muted/30 mx-auto mb-4" />
                <p className="text-text-muted italic">
                  {selectedRunId ? 'No results yet.' : 'Select a run to view results.'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {results.map((res, idx) => {
                  const row = getRowForResult(res);
                  const inputText = row ? extractText(row.input) : 'Unknown input';
                  const expectedText = row ? extractExpected(row.expected) : 'Unknown expected';
                  const actualText = res.output?.output_text || JSON.stringify(res.output);
                  const isExpanded = expandedResultId === res.id;
                  const exactMatch = res.scores?.exact_match;
                  const containsScore = res.scores?.contains;
                  const llmJudge = res.scores?.llm_judge;

                  return (
                    <div
                      key={res.id}
                      className={`bg-panel border rounded-2xl overflow-hidden transition-all ${getScoreBg(exactMatch)}`}
                    >
                      {/* Result Header */}
                      <button
                        onClick={() => setExpandedResultId(isExpanded ? null : res.id)}
                        className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-black/5 transition-colors"
                      >
                        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-wispr-purple/10 text-wispr-purple flex items-center justify-center text-xs font-bold">
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-text-main line-clamp-1 font-medium">{inputText}</p>
                          <p className="text-xs text-text-muted mt-0.5 line-clamp-1">
                            <span className="text-amber-500 font-medium">Output:</span> {actualText}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          {/* Scores */}
                          <div className={`text-lg font-black tabular-nums ${getScoreColor(exactMatch)}`}>
                            {exactMatch !== undefined ? `${(exactMatch * 100).toFixed(0)}%` : '—'}
                          </div>
                          <div className="text-xs text-text-muted tabular-nums">
                            {res.latency_ms?.toFixed(0)}ms
                          </div>
                          {isExpanded ? (
                            <ChevronDownIcon className="w-5 h-5 text-text-muted" />
                          ) : (
                            <ChevronRightIcon className="w-5 h-5 text-text-muted" />
                          )}
                        </div>
                      </button>

                      {/* Expanded Comparison View */}
                      {isExpanded && (
                        <div className="px-5 pb-5 pt-2 border-t border-border-base/50">
                          {/* All Scores */}
                          <div className="flex gap-3 mb-4">
                            <div className={`px-3 py-1.5 rounded-lg border ${getScoreBg(exactMatch)}`}>
                              <span className="text-[10px] uppercase tracking-wider text-text-muted font-bold">Exact Match</span>
                              <span className={`ml-2 font-bold ${getScoreColor(exactMatch)}`}>
                                {exactMatch !== undefined ? (exactMatch * 100).toFixed(0) : '—'}%
                              </span>
                            </div>
                            {containsScore !== undefined && (
                              <div className={`px-3 py-1.5 rounded-lg border ${getScoreBg(containsScore)}`}>
                                <span className="text-[10px] uppercase tracking-wider text-text-muted font-bold">Contains</span>
                                <span className={`ml-2 font-bold ${getScoreColor(containsScore)}`}>
                                  {(containsScore * 100).toFixed(0)}%
                                </span>
                              </div>
                            )}
                            {llmJudge !== undefined && (
                              <div className={`px-3 py-1.5 rounded-lg border ${getScoreBg(llmJudge)}`}>
                                <span className="text-[10px] uppercase tracking-wider text-text-muted font-bold">LLM Judge</span>
                                <span className={`ml-2 font-bold ${getScoreColor(llmJudge)}`}>
                                  {(llmJudge * 100).toFixed(0)}%
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Input / Expected / Actual Comparison */}
                          <div className="grid md:grid-cols-3 gap-4">
                            {/* Input */}
                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-wispr-purple">📥 Input</span>
                              </div>
                              <div className="bg-app rounded-xl border border-border-base p-3 h-32 overflow-y-auto">
                                <p className="text-xs text-text-main whitespace-pre-wrap">{inputText}</p>
                              </div>
                            </div>

                            {/* Expected */}
                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-500">✓ Expected</span>
                              </div>
                              <div className="bg-emerald-500/5 rounded-xl border border-emerald-500/20 p-3 h-32 overflow-y-auto">
                                <p className="text-xs text-text-main whitespace-pre-wrap">{expectedText}</p>
                              </div>
                            </div>

                            {/* Actual */}
                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500">🤖 Actual Output</span>
                              </div>
                              <div className="bg-amber-500/5 rounded-xl border border-amber-500/20 p-3 h-32 overflow-y-auto">
                                <p className="text-xs text-text-main whitespace-pre-wrap">{actualText}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Version Modal */}
      {showCreateVersion && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-panel border border-border-base rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-border-base">
              <h3 className="text-lg font-serif font-black text-text-main">New Experiment Version</h3>
              <p className="text-xs text-text-muted mt-1">Test a different model, prompt, or parameters</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-text-muted mb-2">Model</label>
                <select
                  value={newVersion.model_registry_id}
                  onChange={(e) => setNewVersion((p) => ({ ...p, model_registry_id: e.target.value }))}
                  className="w-full bg-app border border-border-base rounded-xl px-4 py-3 text-sm text-text-main"
                >
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>{m.display_name || `${m.provider}:${m.model_id}`}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-text-muted mb-2">Temperature</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="2"
                    value={newVersion.temperature}
                    onChange={(e) => setNewVersion((p) => ({ ...p, temperature: Number(e.target.value) }))}
                    className="w-full bg-app border border-border-base rounded-xl px-4 py-3 text-sm text-text-main"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-text-muted mb-2">Max Tokens</label>
                  <input
                    type="number"
                    value={newVersion.max_tokens}
                    onChange={(e) => setNewVersion((p) => ({ ...p, max_tokens: e.target.value }))}
                    className="w-full bg-app border border-border-base rounded-xl px-4 py-3 text-sm text-text-main"
                    placeholder="(optional)"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-text-muted mb-2">System Prompt</label>
                <textarea
                  value={newVersion.system_prompt}
                  onChange={(e) => setNewVersion((p) => ({ ...p, system_prompt: e.target.value }))}
                  className="w-full bg-app border border-border-base rounded-xl px-4 py-3 text-sm text-text-main h-24 resize-none"
                  placeholder="Instructions for the AI..."
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-text-muted mb-2">Scorers</label>
                <p className="text-xs text-text-muted mb-3">Select how to evaluate the AI's output against the expected answer:</p>
                <div className="space-y-2">
                  {scorers.map((scorer) => (
                    <label key={scorer.id} className="flex items-start gap-3 p-3 rounded-xl border border-border-base hover:border-border-hover hover:bg-app/30 cursor-pointer transition-all">
                      <input
                        type="checkbox"
                        checked={newVersion.scorers.includes(scorer.name)}
                        onChange={(e) => {
                          setNewVersion((p) => ({
                            ...p,
                            scorers: e.target.checked
                              ? [...p.scorers, scorer.name]
                              : p.scorers.filter((s) => s !== scorer.name)
                          }));
                        }}
                        className="w-4 h-4 mt-0.5 rounded border-border-base text-wispr-purple flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-text-main">{scorer.display_name || scorer.name}</span>
                          {scorer.runtime === 'llm_judge' && (
                            <span className="text-[9px] bg-wispr-purple/20 text-wispr-purple px-1.5 py-0.5 rounded-full font-medium">Uses LLM</span>
                          )}
                          {scorer.runtime === 'builtin' && (
                            <span className="text-[9px] bg-emerald-500/20 text-emerald-600 px-1.5 py-0.5 rounded-full font-medium">Fast</span>
                          )}
                        </div>
                        <p className="text-[11px] text-text-muted mt-0.5 leading-relaxed">
                          {scorer.description || getDefaultScorerDescription(scorer.name)}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
                {scorers.length === 0 && (
                  <div className="text-xs text-text-muted italic p-4 border border-dashed border-border-base rounded-xl text-center">
                    No scorers available. Run seed-builtins to add default scorers.
                  </div>
                )}
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-text-muted mb-2">Notes</label>
                <input
                  value={newVersion.notes}
                  onChange={(e) => setNewVersion((p) => ({ ...p, notes: e.target.value }))}
                  className="w-full bg-app border border-border-base rounded-xl px-4 py-3 text-sm text-text-main"
                  placeholder="What are you testing?"
                />
              </div>
              <div className="flex gap-4 pt-2">
                <button
                  onClick={() => setShowCreateVersion(false)}
                  className="flex-1 px-4 py-3 bg-app border border-border-base rounded-xl text-sm font-bold text-text-muted hover:text-text-main transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={createVersion}
                  className="flex-1 px-4 py-3 bg-wispr-purple text-white rounded-xl text-sm font-bold shadow-lg shadow-wispr-purple/20 hover:bg-wispr-purple-dark transition-all"
                >
                  Create Version
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExperimentDetail;
