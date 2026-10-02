import { useCallback, useMemo, useRef, useState } from 'react';
import { getErrorMessage, isAbortError } from '../../lib/errors';
import {
  buildRequestMessages,
  makeId,
  MAX_RUNS,
} from './model';
import type { Message, PlaygroundRun, PlaygroundVariant } from './model';
import { streamPlaygroundChat } from './stream';

export interface UsePlaygroundRunsOptions {
  projectId: string;
  systemPrompt: string;
  input: string;
  messages: Message[];
}

export const usePlaygroundRuns = ({
  projectId,
  systemPrompt,
  input,
  messages,
}: UsePlaygroundRunsOptions) => {
  const [runs, setRuns] = useState<PlaygroundRun[]>([]);
  const [runNotice, setRunNotice] = useState<string | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);
  const runControllersRef = useRef<Record<string, AbortController>>({});

  const latestRunByVariant = useMemo(() => {
    const latestRuns = new Map<string, PlaygroundRun>();
    for (const run of runs) {
      if (!latestRuns.has(run.variantId)) {
        latestRuns.set(run.variantId, run);
      }
    }
    return latestRuns;
  }, [runs]);

  const runningCount = useMemo(
    () => runs.filter((run) => run.status === 'running').length,
    [runs]
  );
  const lastRun = runs[0];

  const addRun = useCallback((run: PlaygroundRun) => {
    setRuns((previousRuns) => [run, ...previousRuns].slice(0, MAX_RUNS));
  }, []);

  const updateRun = useCallback((runId: string, patch: Partial<PlaygroundRun>) => {
    setRuns((previousRuns) =>
      previousRuns.map((run) => (run.id === runId ? { ...run, ...patch } : run))
    );
  }, []);

  const clearRunNotice = useCallback(() => setRunNotice(null), []);
  const showRunNotice = useCallback((message: string) => setRunNotice(message), []);

  const clearRuns = useCallback(() => setRuns([]), []);
  const resetRuns = useCallback(() => {
    setRuns([]);
    setRunNotice(null);
  }, []);
  const removeRunsForVariant = useCallback((variantId: string) => {
    setRuns((previousRuns) => previousRuns.filter((run) => run.variantId !== variantId));
  }, []);

  const runVariant = useCallback(async (variant: PlaygroundVariant) => {
    if (!projectId) {
      setRunNotice('Select a project before running.');
      return;
    }

    const traceId = makeId('trace');
    const runId = makeId('run');
    const startedAt = Date.now();
    const run: PlaygroundRun = {
      id: runId,
      variantId: variant.id,
      variantName: variant.name,
      model: variant.model,
      provider: variant.provider,
      status: 'running',
      output: '',
      reasoning: '',
      traceId,
      startedAt,
    };

    addRun(run);
    setRunNotice(null);

    const controller = new AbortController();
    runControllersRef.current[runId] = controller;

    try {
      const { output, reasoning } = await streamPlaygroundChat({
        projectId,
        variant,
        messages: buildRequestMessages(systemPrompt, messages, input),
        traceId,
        signal: controller.signal,
        onUpdate: (content, reasoningContent) => {
          updateRun(runId, { output: content, reasoning: reasoningContent });
        },
      });
      updateRun(runId, { status: 'success', completedAt: Date.now(), output, reasoning });
    } catch (error: unknown) {
      const aborted = isAbortError(error);
      const message = getErrorMessage(error, 'Run failed');
      updateRun(runId, {
        status: aborted ? 'canceled' : 'error',
        completedAt: Date.now(),
        error: aborted ? 'Canceled' : message,
      });
      if (!aborted) {
        setRunNotice(message);
      }
    } finally {
      delete runControllersRef.current[runId];
    }
  }, [addRun, input, messages, projectId, systemPrompt, updateRun]);

  const runAll = useCallback(async (variants: PlaygroundVariant[]) => {
    if (!variants.length || batchRunning) return;
    setBatchRunning(true);
    setRunNotice(null);
    try {
      await Promise.all(variants.map((variant) => runVariant(variant)));
    } finally {
      setBatchRunning(false);
    }
  }, [batchRunning, runVariant]);

  const stopRun = useCallback((runId: string) => {
    runControllersRef.current[runId]?.abort();
  }, []);

  const stopAll = useCallback(() => {
    for (const runId of Object.keys(runControllersRef.current)) {
      runControllersRef.current[runId]?.abort();
    }
  }, []);

  return {
    runs,
    runNotice,
    batchRunning,
    latestRunByVariant,
    runningCount,
    lastRun,
    clearRunNotice,
    showRunNotice,
    clearRuns,
    resetRuns,
    removeRunsForVariant,
    runVariant,
    runAll,
    stopRun,
    stopAll,
  };
};
