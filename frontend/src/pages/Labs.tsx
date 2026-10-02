import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { getErrorMessage } from '../lib/errors';
import { useProject } from '../contexts/ProjectContext';
import {
  DEFAULT_MODELS,
} from '../features/playground/model';
import type {
  ModelOption,
  PlaygroundRun,
} from '../features/playground/model';
import type { PlaygroundSidebarProps } from '../features/playground/PlaygroundSidebarState';
import type { PlaygroundPromptCardProps } from '../features/playground/PlaygroundPromptCard';
import type { PlaygroundVariantGridProps } from '../features/playground/PlaygroundVariantGrid';
import type RunComparisonPanel from '../features/playground/RunComparisonPanel';
import { PlaygroundWorkspaceView } from '../features/playground/PlaygroundWorkspaceView';
import { usePlaygroundRuns } from '../features/playground/usePlaygroundRuns';
import { usePlaygroundTrace } from '../features/playground/usePlaygroundTrace';
import { usePlaygroundWorkspace } from '../features/playground/usePlaygroundWorkspace';
import { usePlaygroundSnapshot } from '../features/playground/usePlaygroundSnapshot';
import { usePlaygroundComparison } from '../features/playground/usePlaygroundComparison';
import { usePlaygroundPrompt } from '../features/playground/usePlaygroundPrompt';
import { usePlaygroundVariants } from '../features/playground/usePlaygroundVariants';
import { usePlaygroundPersistence } from '../features/playground/usePlaygroundPersistence';
import { usePlaygroundSelection } from '../features/playground/usePlaygroundSelection';

const Labs: React.FC = () => {
  const { currentProject } = useProject();
  const projectId = currentProject?.id || '';
  const navigate = useNavigate();
  const {
    playgrounds,
    datasets,
    modelRegistry,
    loading: workspaceDataLoading,
    error: workspaceDataError,
    refresh: refreshWorkspace,
  } = usePlaygroundWorkspace(projectId);
  const {
    systemPrompt,
    setSystemPrompt,
    input,
    setInput,
    messages,
    showContext,
    setShowContext,
    loadPrompt,
    resetPrompt,
    addMessage,
    updateMessage,
    removeMessage,
    clearMessages,
    useOutput,
    addToContext,
  } = usePlaygroundPrompt();
  const [snapshotDatasetId, setSnapshotDatasetId] = useState('');
  const [snapshotVariantId, setSnapshotVariantId] = useState('');
  const [snapshotName, setSnapshotName] = useState('');

  const {
    isOpen: traceModalOpen,
    isLoading: traceLoading,
    error: traceError,
    trace: activeTrace,
    openTrace: handleOpenTrace,
    closeTrace: handleCloseTrace,
  } = usePlaygroundTrace();

  const {
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
    stopRun: handleStopRun,
    stopAll: handleStopAll,
  } = usePlaygroundRuns({ projectId, systemPrompt, input, messages });

  const {
    leftRunId: compareLeftId,
    rightRunId: compareRightId,
    leftRun: compareLeft,
    rightRun: compareRight,
    mode: compareMode,
    diff: compareDiff,
    setMode: setCompareMode,
    selectLeftRun,
    selectRightRun,
    removeRuns: removeRunsFromComparison,
    clearSelection: clearComparisonSelection,
  } = usePlaygroundComparison(runs);

  const modelOptions = useMemo<ModelOption[]>(() => {
    if (!modelRegistry.length) return DEFAULT_MODELS;
    return modelRegistry.map((model) => ({
      id: model.model_id,
      label: model.display_name || model.model_id,
      provider: model.provider,
      registryId: model.id,
    }));
  }, [modelRegistry]);

  const {
    variants,
    loadVariants,
    resetVariants,
    addVariant,
    updateVariant,
    removeVariant,
  } = usePlaygroundVariants({
    modelOptions,
    runs,
    removeRunsForVariant,
    removeRunsFromComparison,
  });

  const {
    status: snapshotStatus,
    error: snapshotError,
    experimentId: snapshotExperimentId,
    createSnapshot: handleSnapshot,
    resetSnapshot,
  } = usePlaygroundSnapshot({
    projectId,
    datasetId: snapshotDatasetId,
    variantId: snapshotVariantId,
    snapshotName,
    variants,
    modelRegistry,
    systemPrompt,
  });

  const {
    selectedPlaygroundId,
    setSelectedPlaygroundId,
    activePlaygroundId,
    playgroundName,
    setPlaygroundName,
    playgroundDescription,
    setPlaygroundDescription,
    selectedPlayground,
    config: playgroundConfig,
    currentSignature,
    startNew: handleNewPlayground,
    savedSignature,
    markSaved,
  } = usePlaygroundSelection({
    playgrounds,
    modelOptions,
    systemPrompt,
    input,
    messages,
    variants,
    loadPrompt,
    resetPrompt,
    loadVariants,
    resetVariants,
    resetRuns,
    resetSnapshot,
  });

  const {
    saving: savingPlayground,
    save: handleSavePlayground,
    remove: handleDeletePlayground,
  } = usePlaygroundPersistence({
    projectId,
    activePlaygroundId,
    playgroundName,
    playgroundDescription,
    config: playgroundConfig,
    currentSignature,
    refreshWorkspace,
    clearRunNotice,
    showRunNotice,
    onSaved: markSaved,
    onDeleted: handleNewPlayground,
  });

  const workspaceStatus = useMemo(() => {
    if (savingPlayground) return { label: 'Saving', variant: 'primary' as const };
    if (!activePlaygroundId) return { label: 'Draft', variant: 'neutral' as const };
    if (!savedSignature) return { label: 'Unsaved', variant: 'warning' as const };
    return currentSignature === savedSignature
      ? { label: 'Saved', variant: 'success' as const }
      : { label: 'Unsaved', variant: 'warning' as const };
  }, [savingPlayground, activePlaygroundId, savedSignature, currentSignature]);

  const hasModelRegistry = modelRegistry.length > 0;

  useEffect(() => {
    if (!snapshotVariantId && variants.length) {
      setSnapshotVariantId(variants[0].id);
    } else if (snapshotVariantId && !variants.some((variant) => variant.id === snapshotVariantId)) {
      setSnapshotVariantId(variants[0]?.id || '');
    }
  }, [variants, snapshotVariantId]);

  useEffect(() => {
    if (!playgroundName.trim()) return;
    if (!snapshotName) {
      setSnapshotName(`${playgroundName.trim()} snapshot`);
    }
  }, [playgroundName, snapshotName]);

  const handleClearRuns = () => {
    clearRuns();
    clearComparisonSelection();
  };
  const handleCopyOutput = async (run?: PlaygroundRun) => {
    if (!run?.output) return;
    if (!navigator.clipboard) {
      showRunNotice('Clipboard access is unavailable in this browser.');
      return;
    }
    try {
      await navigator.clipboard.writeText(run.output);
    } catch (error: unknown) {
      showRunNotice(getErrorMessage(error, 'Failed to copy output'));
    }
  };

  const openExperiment = () => {
    if (!snapshotExperimentId) return;
    navigate({ to: `/experiments/${snapshotExperimentId}` });
  };
  const sidebar: PlaygroundSidebarProps = {
    workspace: {
      status: workspaceStatus,
      playgrounds,
      selectedPlaygroundId,
      onSelectPlayground: setSelectedPlaygroundId,
      onRefresh: refreshWorkspace,
      name: playgroundName,
      onNameChange: setPlaygroundName,
      description: playgroundDescription,
      onDescriptionChange: setPlaygroundDescription,
      isSaving: savingPlayground,
      canSave: Boolean(projectId && playgroundName.trim()),
      isActive: Boolean(activePlaygroundId),
      selectedPlayground,
      notice: runNotice,
      onSave: handleSavePlayground,
      onNew: handleNewPlayground,
      onDelete: handleDeletePlayground,
    },
    runBoard: { variants, latestRunByVariant, runningCount, runs, lastRun, onClear: handleClearRuns },
    snapshot: {
      datasets,
      variants,
      datasetId: snapshotDatasetId,
      onDatasetChange: setSnapshotDatasetId,
      variantId: snapshotVariantId,
      onVariantChange: setSnapshotVariantId,
      name: snapshotName,
      onNameChange: setSnapshotName,
      hasModelRegistry,
      status: snapshotStatus,
      error: snapshotError,
      experimentId: snapshotExperimentId,
      onSnapshot: () => handleSnapshot(playgroundName),
      onOpenExperiment: openExperiment,
    },
  };
  const prompt: PlaygroundPromptCardProps = {
    systemPrompt,
    onSystemPromptChange: setSystemPrompt,
    input,
    onInputChange: setInput,
    messages,
    contextVisible: showContext,
    onToggleContext: () => setShowContext((previous) => !previous),
    onAddMessage: addMessage,
    onClearMessages: clearMessages,
    onUpdateMessage: updateMessage,
    onRemoveMessage: removeMessage,
  };
  const variantGrid: PlaygroundVariantGridProps = {
    variants,
    modelOptions,
    latestRunByVariant,
    compareLeftId,
    compareRightId,
    actions: {
      onAddVariant: addVariant,
      onUpdateVariant: updateVariant,
      onRemoveVariant: removeVariant,
      onRunVariant: runVariant,
      onStopRun: handleStopRun,
      onUseOutput: (run) => useOutput(run?.output),
      onAddToContext: (run) => addToContext(run?.output),
      onCopyOutput: handleCopyOutput,
      onOpenTrace: handleOpenTrace,
      onSelectCompareLeft: selectLeftRun,
      onSelectCompareRight: selectRightRun,
    },
  };
  const comparison: React.ComponentProps<typeof RunComparisonPanel> = {
    runs,
    leftRun: compareLeft,
    rightRun: compareRight,
    leftRunId: compareLeftId,
    rightRunId: compareRightId,
    mode: compareMode,
    diff: compareDiff,
    onLeftRunChange: selectLeftRun,
    onRightRunChange: selectRightRun,
    onModeChange: setCompareMode,
  };

  return (
    <PlaygroundWorkspaceView
      projectId={projectId}
      batchRunning={batchRunning}
      runningCount={runningCount}
      onRunAll={() => runAll(variants)}
      onStopAll={handleStopAll}
      workspaceDataError={workspaceDataError}
      workspaceDataLoading={workspaceDataLoading}
      onRetryWorkspace={refreshWorkspace}
      sidebar={sidebar}
      prompt={prompt}
      variantGrid={variantGrid}
      comparison={comparison}
      trace={{
        open: traceModalOpen,
        loading: traceLoading,
        error: traceError,
        activeTrace,
        onClose: handleCloseTrace,
      }}
    />
  );
};

export default Labs;
