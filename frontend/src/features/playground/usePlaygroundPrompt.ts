import { useCallback, useState } from 'react';
import type { Message } from './model';
import { DEFAULT_SYSTEM_PROMPT, makeId } from './model';

export const usePlaygroundPrompt = () => {
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [showContext, setShowContext] = useState(false);

  const loadPrompt = useCallback((
    nextSystemPrompt: string,
    nextInput: string,
    nextMessages: Message[],
  ) => {
    setSystemPrompt(nextSystemPrompt);
    setInput(nextInput);
    setMessages(nextMessages);
    setShowContext(nextMessages.length > 0);
  }, []);

  const resetPrompt = useCallback(
    () => loadPrompt(DEFAULT_SYSTEM_PROMPT, '', []),
    [loadPrompt],
  );

  const addMessage = useCallback(() => {
    setMessages((current) => [...current, { id: makeId('msg'), role: 'user', content: '' }]);
    setShowContext(true);
  }, []);

  const updateMessage = useCallback((id: string, patch: Partial<Message>) => {
    setMessages((current) => current.map((message) =>
      message.id === id ? { ...message, ...patch } : message
    ));
  }, []);

  const removeMessage = useCallback((id: string) => {
    setMessages((current) => current.filter((message) => message.id !== id));
  }, []);

  const clearMessages = useCallback(() => setMessages([]), []);

  const useOutput = useCallback((output?: string) => {
    if (output) setInput(output);
  }, []);

  const addToContext = useCallback((output?: string) => {
    if (!output) return;
    setMessages((current) => [...current, { id: makeId('msg'), role: 'assistant', content: output }]);
    setShowContext(true);
  }, []);

  return {
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
  };
};
