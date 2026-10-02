import { useState } from 'react';
import { API_BASE_URL, api } from '../../lib/api';
import { getErrorMessage } from '../../lib/errors';
import type { Experiment } from '../../types';
import type { OwlActionId } from './OwlPlaybookPanel';

type OwlPageContext = {
  page: string;
  route: string;
  project_name: string;
  params: Record<string, string>;
};

type OwlAssistantOptions = {
  projectId: string;
  projectName?: string;
  pageContext: OwlPageContext;
  experiments: Experiment[];
};

type OwlMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
};

const makeId = (prefix: string) => `${prefix}_${Math.random().toString(16).slice(2, 10)}`;

export const useOwlAssistant = ({
  projectId,
  projectName,
  pageContext,
  experiments,
}: OwlAssistantOptions) => {
  const [activeAction, setActiveAction] = useState<OwlActionId>('aql');
  const [actionInputs, setActionInputs] = useState<Record<string, string>>({});
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<OwlMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const appendMessages = (entries: OwlMessage[]) => {
    setMessages((current) => [...current, ...entries]);
  };

  const sendOwlMessage = async (action: string, userMessage: string) => {
    setLoading(true);
    setActionError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/owl/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Athena-Project-Id': projectId,
        },
        body: JSON.stringify({
          user_message: userMessage,
          action,
          context: pageContext,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Owl request failed');
      }

      const data = await response.json();
      const content = data.content || 'No response returned.';
      appendMessages([
        { id: makeId('msg'), role: 'user', content: userMessage, createdAt: Date.now() },
        { id: makeId('msg'), role: 'assistant', content, createdAt: Date.now() },
      ]);
    } catch (cause: unknown) {
      setActionError(getErrorMessage(cause, 'Owl request failed'));
    } finally {
      setLoading(false);
    }
  };

  const buildUserMessage = (action: OwlActionId): string | null => {
    switch (action) {
      case 'aql': {
        const question = actionInputs.question?.trim();
        if (!question) return null;
        return `Question: ${question}\nProject: ${projectName || projectId}`;
      }
      case 'prompt': {
        const prompt = actionInputs.prompt?.trim();
        if (!prompt) return null;
        const goal = actionInputs.goal?.trim() || 'Improve clarity and policy compliance';
        return `Goal: ${goal}\nOriginal prompt:\n${prompt}`;
      }
      case 'scorer': {
        const criteria = actionInputs.criteria?.trim();
        if (!criteria) return null;
        return `Criteria to cover:\n${criteria}`;
      }
      case 'dataset': {
        const domain = actionInputs.domain?.trim();
        if (!domain) return null;
        return `Domain: ${domain}`;
      }
      default:
        return null;
    }
  };

  const runAction = async () => {
    setActionError(null);
    if (!projectId) return;

    if (activeAction === 'docs') {
      const query = actionInputs.docs_query?.trim();
      if (!query) {
        setActionError('Enter a docs search query.');
        return;
      }

      setLoading(true);
      try {
        const result = await api.searchDocs({ query, limit: 8 });
        const lines = result.results.map((item) => `- ${item.path}:${item.line} ${item.snippet}`);
        const content = lines.length ? lines.join('\n') : 'No matching docs found.';
        appendMessages([
          { id: makeId('msg'), role: 'user', content: `Search docs: ${query}`, createdAt: Date.now() },
          { id: makeId('msg'), role: 'assistant', content, createdAt: Date.now() },
        ]);
      } catch (cause: unknown) {
        setActionError(getErrorMessage(cause, 'Docs search failed'));
      } finally {
        setLoading(false);
      }
      return;
    }

    if (activeAction === 'experiment') {
      const experimentId = actionInputs.experiment_id?.trim();
      if (!experimentId) {
        setActionError('Select an experiment.');
        return;
      }

      setLoading(true);
      try {
        const experiment = experiments.find((candidate) => candidate.id === experimentId);
        const versions = await api.getExperimentVersions(experimentId);
        const latestVersion = [...versions].sort((left, right) =>
          (right.created_at || 0) - (left.created_at || 0)
        )[0];
        if (!latestVersion) throw new Error('No experiment versions found.');

        const runs = await api.getVersionRuns(experimentId, latestVersion.id);
        const latestRun = [...runs].sort((left, right) =>
          (right.created_at || 0) - (left.created_at || 0)
        )[0];
        if (!latestRun) throw new Error('No experiment runs found.');

        const userMessage = `Experiment: ${experiment?.name || experimentId}\nRun summary:\n${JSON.stringify(latestRun.summary || {}, null, 2)}`;
        await sendOwlMessage('experiment', userMessage);
      } catch (cause: unknown) {
        setActionError(getErrorMessage(cause, 'Experiment summary failed'));
        setLoading(false);
      }
      return;
    }

    const userMessage = buildUserMessage(activeAction);
    if (!userMessage) {
      setActionError('Please fill in the required fields.');
      return;
    }
    await sendOwlMessage(activeAction, userMessage);
  };

  const sendChat = async () => {
    const message = chatInput.trim();
    if (!message) return;
    setChatInput('');
    await sendOwlMessage('chat', message);
  };

  const changeAction = (action: OwlActionId) => {
    setActiveAction(action);
    setActionError(null);
  };

  const updateActionInput = (key: string, value: string) => {
    setActionInputs((current) => ({ ...current, [key]: value }));
  };

  return {
    activeAction,
    actionInputs,
    chatInput,
    messages,
    loading,
    actionError,
    setChatInput,
    changeAction,
    updateActionInput,
    clearActionError: () => setActionError(null),
    runAction,
    sendChat,
  };
};
