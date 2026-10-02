import { useEffect, useMemo, useState } from 'react';
import { diffLines, type PlaygroundRun } from './model';

export const usePlaygroundComparison = (runs: PlaygroundRun[]) => {
  const [leftRunId, setLeftRunId] = useState('');
  const [rightRunId, setRightRunId] = useState('');
  const [mode, setMode] = useState<'diff' | 'side'>('diff');
  const [selectionTouched, setSelectionTouched] = useState(false);

  useEffect(() => {
    if (selectionTouched) return;
    if (runs.length >= 2) {
      setRightRunId(runs[0].id);
      setLeftRunId(runs[1].id);
    } else if (runs.length === 1) {
      setRightRunId(runs[0].id);
      setLeftRunId('');
    }
  }, [runs, selectionTouched]);

  const leftRun = runs.find((run) => run.id === leftRunId) || null;
  const rightRun = runs.find((run) => run.id === rightRunId) || null;
  const diff = useMemo(() => {
    if (!leftRun || !rightRun) return [];
    return diffLines(leftRun.output || '', rightRun.output || '');
  }, [leftRun, rightRun]);

  const selectLeftRun = (runId: string) => {
    setSelectionTouched(true);
    setLeftRunId(runId);
  };

  const selectRightRun = (runId: string) => {
    setSelectionTouched(true);
    setRightRunId(runId);
  };

  const removeRuns = (runIds: string[]) => {
    const removedLeft = runIds.includes(leftRunId);
    const removedRight = runIds.includes(rightRunId);
    if (removedLeft) setLeftRunId('');
    if (removedRight) setRightRunId('');
    if (removedLeft || removedRight) setSelectionTouched(false);
  };

  const clearSelection = () => {
    setLeftRunId('');
    setRightRunId('');
    setSelectionTouched(false);
  };

  return {
    leftRunId,
    rightRunId,
    leftRun,
    rightRun,
    mode,
    diff,
    setMode,
    selectLeftRun,
    selectRightRun,
    removeRuns,
    clearSelection,
  };
};
