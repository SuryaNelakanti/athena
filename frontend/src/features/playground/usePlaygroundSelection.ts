import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Playground } from '../../types';
import {
  NEW_PLAYGROUND_VALUE,
  buildPlaygroundConfig,
  decodePlaygroundConfig,
} from './model';
import type { Message, ModelOption, PlaygroundVariant } from './model';

type UsePlaygroundSelectionOptions = {
  playgrounds: Playground[];
  modelOptions: ModelOption[];
  systemPrompt: string;
  input: string;
  messages: Message[];
  variants: PlaygroundVariant[];
  loadPrompt: (systemPrompt: string, input: string, messages: Message[]) => void;
  resetPrompt: () => void;
  loadVariants: (variants: PlaygroundVariant[]) => void;
  resetVariants: () => void;
  resetRuns: () => void;
  resetSnapshot: () => void;
};

export const usePlaygroundSelection = ({
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
}: UsePlaygroundSelectionOptions) => {
  const [selectedPlaygroundId, setSelectedPlaygroundId] = useState(NEW_PLAYGROUND_VALUE);
  const [activePlaygroundId, setActivePlaygroundId] = useState<string | null>(null);
  const [playgroundName, setPlaygroundName] = useState('Untitled Playground');
  const [playgroundDescription, setPlaygroundDescription] = useState('');
  const [savedSignature, setSavedSignature] = useState('');

  const selectedPlayground = useMemo(
    () => playgrounds.find((playground) => playground.id === activePlaygroundId) || null,
    [playgrounds, activePlaygroundId],
  );

  const config = useMemo(
    () => buildPlaygroundConfig(systemPrompt, input, messages, variants),
    [systemPrompt, input, messages, variants],
  );

  const currentSignature = useMemo(
    () => JSON.stringify({
      name: playgroundName.trim(),
      description: playgroundDescription.trim(),
      config,
    }),
    [playgroundName, playgroundDescription, config],
  );

  const isDirty = Boolean(
    activePlaygroundId && savedSignature && currentSignature !== savedSignature
  );

  const startNew = useCallback(() => {
    setSelectedPlaygroundId(NEW_PLAYGROUND_VALUE);
    setActivePlaygroundId(null);
    setPlaygroundName('Untitled Playground');
    setPlaygroundDescription('');
    resetPrompt();
    resetVariants();
    resetRuns();
    setSavedSignature('');
    resetSnapshot();
  }, [resetPrompt, resetVariants, resetRuns, resetSnapshot]);

  const applyPlayground = useCallback((playground: Playground) => {
    const {
      systemPrompt: nextSystemPrompt,
      input: nextInput,
      messages: nextMessages,
      variants: nextVariants,
    } = decodePlaygroundConfig(playground.config, modelOptions);

    setActivePlaygroundId(playground.id);
    setPlaygroundName(playground.name || 'Untitled Playground');
    setPlaygroundDescription(playground.description || '');
    loadPrompt(nextSystemPrompt, nextInput, nextMessages);
    loadVariants(nextVariants);
    setSavedSignature(JSON.stringify({
      name: playground.name || 'Untitled Playground',
      description: playground.description || '',
      config: buildPlaygroundConfig(nextSystemPrompt, nextInput, nextMessages, nextVariants),
    }));
    resetRuns();
    resetSnapshot();
  }, [modelOptions, loadPrompt, loadVariants, resetRuns, resetSnapshot]);

  useEffect(() => {
    if (selectedPlaygroundId === NEW_PLAYGROUND_VALUE) {
      if (activePlaygroundId) startNew();
      return;
    }

    const playground = playgrounds.find((item) => item.id === selectedPlaygroundId);
    if (!playground) return;
    if (isDirty && playground.id === activePlaygroundId) return;
    applyPlayground(playground);
  }, [
    selectedPlaygroundId,
    playgrounds,
    isDirty,
    activePlaygroundId,
    startNew,
    applyPlayground,
  ]);

  const markSaved = useCallback((playground: Playground, signature: string) => {
    setActivePlaygroundId(playground.id);
    setSelectedPlaygroundId(playground.id);
    setSavedSignature(signature);
  }, []);

  return {
    selectedPlaygroundId,
    setSelectedPlaygroundId,
    activePlaygroundId,
    playgroundName,
    setPlaygroundName,
    playgroundDescription,
    setPlaygroundDescription,
    selectedPlayground,
    config,
    currentSignature,
    savedSignature,
    isDirty,
    startNew,
    markSaved,
  };
};
