import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import { Experiment, ExperimentRun, ExperimentRunResult, ExperimentVersion, ModelRegistry } from '../types';
import { ChevronLeftIcon, PlusIcon, PlayIcon, StopIcon, StarIcon } from '@heroicons/react/24/outline';

interface ExperimentDetailProps {
  experiment: Experiment;
  onBack: () => void;
}

function formatDateTime(ms?: number | null) {
  if (!ms) return '-';
  return new Date(ms).toLocaleString();
}

const ExperimentDetail: React.FC<ExperimentDetailProps> = ({ experiment, onBack }) => {
  const [exp, setExp] = useState<Experiment>(experiment);
  const [models, setModels] = useState<ModelRegistry[]>([]);
  const [versions, setVersions] = useState<ExperimentVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);

  const [runs, setRuns] = useState<ExperimentRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [results, setResults] = useState<ExperimentRunResult[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreateVersion, setShowCreateVersion] = useState(false);
  const [newVersion, setNewVersion] = useState({
    parent_version_id: '',
    model_registry_id: '',
    temperature: 1.0,
    max_tokens: '',
    system_prompt: '',
    notes: '',
  });

  const mainVersionId = (exp.summary as any)?.main_version_id as string | undefined;

  useEffect(() => setExp(experiment), [experiment]);

  const refreshAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [modelsData, versionsData] = await Promise.all([
        api.getModelRegistry(true),
        api.getExperimentVersions(exp.id),
      ]);
      setModels(modelsData);
      setVersions(versionsData);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVersionId]);

  const selectedRun = useMemo(() => runs.find((r) => r.id === selectedRunId) || null, [runs, selectedRunId]);

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
        system_prompt: newVersion.system_prompt || '',
        notes: newVersion.notes || '',
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

  const selectedVersion = versions.find((v) => v.id === selectedVersionId) || null;
  const selectedModel = selectedVersion ? (selectedVersion.config as any)?.model : null;

  return (
    <div className="h-full flex flex-col bg-app transition-colors duration-300">
      <div className="h-20 border-b border-border-base flex items-center justify-between px-8 bg-app shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 -ml-2 rounded-xl text-text-muted hover:text-text-main hover:bg-panel-hover transition-all">
            <ChevronLeftIcon className="w-5 h-5" />
          </button>
          <div>
            <div className="text-xl font-serif font-black text-text-main">{exp.name}</div>
            <div className="text-xs text-text-muted">Dataset: {exp.dataset_id}</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCreateVersion(true)}
            className="flex items-center gap-2 px-4 py-2 bg-panel border border-border-base rounded-xl text-xs font-bold text-text-muted hover:text-text-main hover:border-border-hover transition-all"
          >
            <PlusIcon className="w-4 h-4" />
            NEW VERSION
          </button>
          <button
            onClick={runVersion}
            disabled={!selectedVersionId || loading}
            className="flex items-center gap-2 px-4 py-2 bg-wispr-purple text-white rounded-xl text-xs font-bold shadow-lg shadow-wispr-purple/20 hover:bg-wispr-purple-dark disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <PlayIcon className="w-4 h-4" />
            RUN
          </button>
        </div>
      </div>

      {showCreateVersion && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-panel border border-border-base rounded-3xl p-8 max-w-xl w-full shadow-2xl">
            <h2 className="text-2xl font-serif font-black text-text-main mb-6">New Version</h2>
            {models.length === 0 ? (
              <div className="text-sm text-text-muted">No models registered yet. Add models in Settings first.</div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-text-muted mb-2">Parent</label>
                    <select
                      value={newVersion.parent_version_id}
                      onChange={(e) => setNewVersion((p) => ({ ...p, parent_version_id: e.target.value }))}
                      className="w-full bg-app border border-border-base rounded-xl px-4 py-3 text-sm text-text-main"
                    >
                      <option value="">None</option>
                      {versions
                        .slice()
                        .sort((a, b) => b.version_number - a.version_number)
                        .map((v) => (
                          <option key={v.id} value={v.id}>
                            v{v.version_number}{v.id === mainVersionId ? ' (main)' : ''}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-text-muted mb-2">Model</label>
                    <select
                      value={newVersion.model_registry_id}
                      onChange={(e) => setNewVersion((p) => ({ ...p, model_registry_id: e.target.value }))}
                      className="w-full bg-app border border-border-base rounded-xl px-4 py-3 text-sm text-text-main"
                    >
                      {models.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.provider}: {m.display_name || m.model_id}
                        </option>
                      ))}
                    </select>
                  </div>
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
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-text-muted mb-2">Notes</label>
                  <input
                    value={newVersion.notes}
                    onChange={(e) => setNewVersion((p) => ({ ...p, notes: e.target.value }))}
                    className="w-full bg-app border border-border-base rounded-xl px-4 py-3 text-sm text-text-main"
                    placeholder="What changed?"
                  />
                </div>
                {error && <div className="text-xs text-rose-500 font-bold">{error}</div>}
                <div className="flex gap-4 pt-2">
                  <button
                    onClick={() => setShowCreateVersion(false)}
                    className="flex-1 px-4 py-3 bg-app border border-border-base rounded-xl text-sm font-bold text-text-muted hover:text-text-main transition-all"
                  >
                    CANCEL
                  </button>
                  <button
                    onClick={createVersion}
                    className="flex-1 px-4 py-3 bg-wispr-purple text-white rounded-xl text-sm font-bold shadow-lg shadow-wispr-purple/20 hover:bg-wispr-purple-dark transition-all"
                  >
                    CREATE
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 flex">
        <div className="w-80 border-r border-border-base overflow-y-auto bg-app/50">
          <div className="px-5 py-4 border-b border-border-base bg-app/70 sticky top-0 backdrop-blur-sm">
            <div className="text-[10px] uppercase tracking-widest text-text-muted font-bold opacity-60">Versions</div>
          </div>
          {versions.length === 0 && !loading && <div className="p-5 text-sm text-text-muted italic">No versions yet.</div>}
          <div className="divide-y divide-border-base/50">
            {versions
              .slice()
              .sort((a, b) => b.version_number - a.version_number)
              .map((v) => {
                const isSelected = v.id === selectedVersionId;
                const isMain = v.id === mainVersionId;
                const model = (v.config as any)?.model;
                return (
                  <button
                    key={v.id}
                    onClick={() => setSelectedVersionId(v.id)}
                    className={`w-full text-left px-5 py-4 hover:bg-panel-hover transition-colors ${isSelected ? 'bg-wispr-purple/10' : ''}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-text-main">v{v.version_number}</span>
                        {isMain && <StarIcon className="w-4 h-4 text-amber-400" />}
                      </div>
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          setMain(v.id);
                        }}
                        className="text-[10px] font-bold uppercase tracking-widest text-wispr-purple hover:text-wispr-purple-dark"
                      >
                        Set Main
                      </span>
                    </div>
                    <div className="text-[11px] text-text-muted truncate mt-1">
                      {model ? `${model.provider}:${model.id}` : '—'}
                    </div>
                    <div className="text-[10px] text-text-muted opacity-60 mt-1">Pinned dataset v{v.dataset_version_pinned}</div>
                  </button>
                );
              })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
          {error && <div className="mb-4 text-xs text-rose-500 font-bold">{error}</div>}

          <div className="bg-panel border border-border-base rounded-2xl p-6 mb-6">
            <div className="text-[10px] uppercase tracking-widest text-text-muted font-bold opacity-60">Selected Version</div>
            {selectedVersion ? (
              <div className="mt-2">
                <div className="text-xl font-serif font-black text-text-main">v{selectedVersion.version_number}</div>
                <div className="text-xs text-text-muted mt-1">
                  Model: <span className="text-text-main">{selectedModel?.provider}:{selectedModel?.id}</span>
                </div>
                <div className="text-xs text-text-muted mt-1">Created: {formatDateTime(selectedVersion.created_at)}</div>
                <div className="text-xs text-text-muted mt-1">Notes: <span className="text-text-main">{(selectedVersion.config as any)?.notes || '—'}</span></div>
              </div>
            ) : (
              <div className="mt-2 text-sm text-text-muted italic">Select a version to run.</div>
            )}
          </div>

          <div className="mb-3 flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-widest text-text-muted font-bold opacity-60">Runs</div>
            {selectedRun && (
              <div className="text-xs text-text-muted tabular-nums">
                Progress {Number(selectedRun.summary?.rows_done || 0)}/{Number(selectedRun.summary?.rows_total || 0)}
              </div>
            )}
          </div>

          <div className="border border-border-base rounded-2xl overflow-hidden bg-panel shadow-sm mb-8">
            <div className="grid grid-cols-12 gap-4 px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-text-muted border-b border-border-base bg-app/50">
              <div className="col-span-5">Run</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-2 text-right">Avg</div>
              <div className="col-span-2 text-right">Tokens</div>
              <div className="col-span-1 text-right">Cancel</div>
            </div>
            {runs.length === 0 && !loading ? (
              <div className="px-6 py-10 text-center text-text-muted italic text-sm">No runs yet.</div>
            ) : (
              <div className="divide-y divide-border-base/50">
                {runs.map((r) => (
                  <div
                    key={r.id}
                    onClick={() => setSelectedRunId(r.id)}
                    className={`grid grid-cols-12 gap-4 px-6 py-4 text-xs cursor-pointer hover:bg-panel-hover transition-colors ${r.id === selectedRunId ? 'bg-wispr-purple/10' : ''}`}
                  >
                    <div className="col-span-5 text-[11px] truncate" title={r.id}>
                      {r.id}
                      <div className="text-[10px] text-text-muted opacity-70 mt-1">{formatDateTime(r.created_at)}</div>
                    </div>
                    <div className="col-span-2 font-bold uppercase tracking-widest text-[10px] opacity-70">{r.status}</div>
                    <div className="col-span-2 text-right tabular-nums">{(Number(r.summary?.avg_score || 0) * 100).toFixed(1)}%</div>
                    <div className="col-span-2 text-right tabular-nums">{Number(r.summary?.tokens_total || 0).toLocaleString()}</div>
                    <div className="col-span-1 text-right">
                      {(r.status === 'queued' || r.status === 'running') ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            cancelRun(r.id);
                          }}
                          className="inline-flex items-center gap-1 text-rose-500 hover:text-rose-400 font-bold text-[10px] uppercase tracking-widest"
                        >
                          <StopIcon className="w-4 h-4" /> Cancel
                        </button>
                      ) : (
                        <span className="text-text-muted text-[10px] uppercase tracking-widest opacity-50">—</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mb-3 flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-widest text-text-muted font-bold opacity-60">Results</div>
          </div>

          <div className="border border-border-base rounded-2xl overflow-hidden bg-panel shadow-sm">
            <div className="grid grid-cols-12 gap-4 px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-text-muted border-b border-border-base bg-app/50">
              <div className="col-span-3">Row</div>
              <div className="col-span-6">Output</div>
              <div className="col-span-1 text-right">Score</div>
              <div className="col-span-2 text-right">Latency</div>
            </div>
            {selectedRunId && results.length === 0 && !loading ? (
              <div className="px-6 py-10 text-center text-text-muted italic text-sm">No results yet.</div>
            ) : (
              <div className="divide-y divide-border-base/50">
                {results.map((res) => (
                  <div key={res.id} className="grid grid-cols-12 gap-4 px-6 py-4 text-xs hover:bg-panel-hover transition-colors">
                    <div className="col-span-3 text-[11px] truncate" title={res.dataset_row_id}>
                      {res.dataset_row_id}
                      {res.output?.athena_trace_id && <div className="text-[10px] text-text-muted opacity-70 mt-1">Trace {res.output.athena_trace_id}</div>}
                    </div>
                    <div className="col-span-6">
                      <div className="bg-app/50 p-2 rounded-lg border border-border-base/50 max-h-24 overflow-y-auto text-[10px] whitespace-pre-wrap">
                        {res.output?.output_text || JSON.stringify(res.output, null, 2)}
                      </div>
                    </div>
                    <div className="col-span-1 text-right tabular-nums">{res.scores?.exact_match !== undefined ? Number(res.scores.exact_match).toFixed(2) : '—'}</div>
                    <div className="col-span-2 text-right tabular-nums text-text-muted">{res.latency_ms.toFixed(0)}ms</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExperimentDetail;
