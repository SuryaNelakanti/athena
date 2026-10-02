import { useCallback, useEffect, useMemo, useState } from 'react';

import { api } from '../../lib/api';
import { getErrorMessage } from '../../lib/errors';
import type { AgentRun, RunGraph, SessionEval } from '../../types';
import { stringList } from './runNarrativeUtils';

export function useRunNarrativeData(runId: string) {
  const [run, setRun] = useState<AgentRun | null>(null);
  const [graph, setGraph] = useState<RunGraph | null>(null);
  const [graphError, setGraphError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [sessionEval, setSessionEval] = useState<SessionEval | null>(null);
  const [evalLoading, setEvalLoading] = useState(false);
  const [evalRunning, setEvalRunning] = useState(false);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [evalExpected, setEvalExpected] = useState('');
  const [evalCriteria, setEvalCriteria] = useState('');
  const [evalUseJudge, setEvalUseJudge] = useState(false);

  useEffect(() => {
    if (!runId) return;
    let isCurrent = true;
    setLoading(true);
    setError(null);
    setGraphError(null);
    setRun(null);
    setGraph(null);

    Promise.allSettled([api.getRun(runId), api.getRunGraph(runId)])
      .then(([runResult, graphResult]) => {
        if (!isCurrent) return;
        if (runResult.status === 'rejected') {
          setError(getErrorMessage(runResult.reason, 'Failed to load run'));
          return;
        }

        setRun(runResult.value);
        if (graphResult.status === 'fulfilled') {
          setGraph(graphResult.value);
        } else {
          setGraphError(getErrorMessage(graphResult.reason, 'Failed to load run graph'));
        }
      })
      .finally(() => {
        if (isCurrent) setLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [runId, reloadKey]);

  useEffect(() => {
    if (!run?.session_id || !run.id) return;
    let isCurrent = true;
    setEvalLoading(true);
    setEvalError(null);
    setSessionEval(null);
    api.getSessionEvals(run.session_id, { run_id: run.id, limit: 1 })
      .then((evals) => {
        if (isCurrent) setSessionEval(evals[0] || null);
      })
      .catch((cause: unknown) => {
        if (isCurrent) setEvalError(getErrorMessage(cause, 'Failed to load evaluation'));
      })
      .finally(() => {
        if (isCurrent) setEvalLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [run?.session_id, run?.id]);

  const runEvaluation = async () => {
    if (!run?.session_id || !run.id) return;
    setEvalRunning(true);
    setEvalError(null);
    try {
      const criteria = evalCriteria.trim();
      const expectedValue = evalExpected.trim();
      const scorers: Array<Record<string, unknown>> = [
        { type: 'tool_correctness' },
        { type: 'path_efficiency' },
      ];
      if (evalUseJudge) {
        const judgeConfig: Record<string, unknown> = { type: 'llm_judge' };
        if (criteria) judgeConfig.criteria = criteria;
        scorers.push(judgeConfig);
      }
      const createdEval = await api.createSessionEval(run.session_id, {
        run_id: run.id,
        scorers,
        expected: expectedValue || undefined,
        rubric: criteria ? { criteria } : undefined,
      });
      setSessionEval(createdEval);
    } catch (cause: unknown) {
      setEvalError(getErrorMessage(cause, 'Failed to run evaluation'));
    } finally {
      setEvalRunning(false);
    }
  };

  const retryLoad = useCallback(() => {
    setReloadKey((current) => current + 1);
  }, []);

  const evalScoreEntries = useMemo(() => {
    if (!sessionEval?.scores) return [];
    return Object.entries(sessionEval.scores).flatMap(([key, value]) => (
      !key.endsWith('_details') && typeof value === 'number'
        ? [[key, value] as [string, number]]
        : []
    ));
  }, [sessionEval]);

  const flaggedNodeIds = useMemo(
    () => stringList(sessionEval?.summary?.failing_node_ids),
    [sessionEval],
  );

  return {
    run,
    graph,
    graphError,
    loading,
    error,
    retryLoad,
    sessionEval,
    evalLoading,
    evalRunning,
    evalError,
    evalExpected,
    setEvalExpected,
    evalCriteria,
    setEvalCriteria,
    evalUseJudge,
    setEvalUseJudge,
    runEvaluation,
    evalScoreEntries,
    flaggedNodeIds,
  };
}
