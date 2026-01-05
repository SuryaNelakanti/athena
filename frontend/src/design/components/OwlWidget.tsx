import React, { useEffect, useMemo, useState } from 'react';
import { api, API_BASE_URL } from '../../services/api';
import { Badge, Button, Input, Select, Textarea } from '../ui';
import { ChatBubbleLeftRightIcon, XMarkIcon } from '@heroicons/react/24/outline';

interface OwlWidgetProps {
  projectId: string;
  projectName?: string;
  currentPath: string;
  routeParams?: Record<string, string>;
}

type OwlActionId = 'aql' | 'prompt' | 'scorer' | 'dataset' | 'experiment' | 'docs';

type OwlMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
};

const OWL_ACTIONS: Array<{
  id: OwlActionId;
  title: string;
  description: string;
}> = [
  {
    id: 'aql',
    title: 'AQL Author',
    description: 'Describe the question and get a ready-to-run AQL query.',
  },
  {
    id: 'prompt',
    title: 'Prompt Optimizer',
    description: 'Refine prompts for tone, safety, and clarity.',
  },
  {
    id: 'scorer',
    title: 'Scorer Draft',
    description: 'Create a criteria-based scorer checklist.',
  },
  {
    id: 'dataset',
    title: 'Dataset Ideas',
    description: 'Generate dataset rows for new evaluation coverage.',
  },
  {
    id: 'experiment',
    title: 'Experiment Summary',
    description: 'Summarize the latest experiment run and next steps.',
  },
  {
    id: 'docs',
    title: 'Docs Search',
    description: 'Find exact snippets in Athena docs.',
  },
];

const OWL_MODEL = 'gpt-4o-mini';

const makeId = (prefix: string) => `${prefix}_${Math.random().toString(16).slice(2, 10)}`;

const pageLabelForPath = (path: string) => {
  if (path === '/') return 'Dashboard';
  if (path.startsWith('/logs')) return 'Logs';
  if (path.startsWith('/review')) return 'Review';
  if (path.startsWith('/datasets')) return 'Datasets';
  if (path.startsWith('/experiments')) return 'Experiments';
  if (path.startsWith('/playgrounds') || path.startsWith('/labs')) return 'Playgrounds';
  if (path.startsWith('/collaboration')) return 'Collaboration';
  if (path.startsWith('/settings')) return 'Settings';
  return 'Athena';
};

const OwlWidget: React.FC<OwlWidgetProps> = ({
  projectId,
  projectName,
  currentPath,
  routeParams = {},
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<OwlMessage[]>([]);
  const [activeAction, setActiveAction] = useState<OwlActionId>('aql');
  const [actionInputs, setActionInputs] = useState<Record<string, string>>({});
  const [chatInput, setChatInput] = useState('');
  const [experiments, setExperiments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    api.getExperiments(projectId).then(setExperiments).catch(() => setExperiments([]));
  }, [projectId]);

  const experimentOptions = useMemo(() => {
    return experiments.map((exp: any) => ({ value: exp.id, label: exp.name || exp.id }));
  }, [experiments]);

  const routeParamEntries = useMemo(
    () => Object.entries(routeParams).filter(([, value]) => value),
    [routeParams]
  );

  const pageLabel = useMemo(() => pageLabelForPath(currentPath), [currentPath]);

  const contextBlock = useMemo(() => {
    const lines: string[] = [];
    if (pageLabel) lines.push(`Page: ${pageLabel}`);
    if (currentPath) lines.push(`Route: ${currentPath}`);
    if (projectName || projectId) lines.push(`Project: ${projectName || projectId}`);
    if (routeParamEntries.length) {
      lines.push(`Params: ${routeParamEntries.map(([key, value]) => `${key}=${value}`).join(', ')}`);
    }
    return lines.join('\n');
  }, [pageLabel, currentPath, projectName, projectId, routeParamEntries]);

  const contextSummary = useMemo(() => {
    const parts = [pageLabel];
    if (routeParamEntries.length) {
      parts.push(routeParamEntries.map(([key, value]) => `${key}=${value}`).join(', '));
    }
    return parts.filter(Boolean).join(' | ');
  }, [pageLabel, routeParamEntries]);

  const appendMessages = (entries: OwlMessage[]) => {
    setMessages((prev) => [...prev, ...entries]);
  };

  const buildSystemPrompt = (instruction: string) => {
    const lines = [
      'You are Athena Owl, the in-app assistant for Athena.',
      'Use the current page context to guide the user through the product.',
      'Ask clarifying questions when needed before giving the final output.',
    ];
    if (contextBlock) {
      lines.push(`Current page context:\n${contextBlock}`);
    }
    if (instruction) {
      lines.push(instruction);
    }
    return lines.join('\n');
  };

  const sendOwlMessage = async (systemPrompt: string, userPrompt: string) => {
    setLoading(true);
    setActionError(null);
    const traceId = `trace_owl_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
    try {
      const response = await fetch(`${API_BASE_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Athena-Project-Id': projectId,
        },
        body: JSON.stringify({
          model: OWL_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.2,
          stream: false,
          trace_id: traceId,
          project_id: projectId,
        }),
      });
      if (!response.ok) {
        throw new Error('Owl request failed');
      }
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || 'No response returned.';
      appendMessages([
        { id: makeId('msg'), role: 'user', content: userPrompt, createdAt: Date.now() },
        { id: makeId('msg'), role: 'assistant', content, createdAt: Date.now() },
      ]);
    } catch (error: any) {
      setActionError(error?.message || 'Owl request failed');
    } finally {
      setLoading(false);
    }
  };

  const buildAqlPrompt = () => {
    const question = actionInputs.question?.trim();
    if (!question) return null;
    const schema = [
      'project_logs fields: timestamp, latency_ms, cost, total_tokens, model, provider, status, event_type',
      'project_traces fields: timestamp, total_latency, total_cost, total_tokens, status',
    ].join('\n');
    return {
      system: buildSystemPrompt(
        'Produce a concise AQL query and a 2-sentence explanation. If clarification is required, ask a question first.'
      ),
      user: `Project: ${projectName || projectId}\nQuestion: ${question}\n${schema}\nReturn only AQL and the short explanation.`,
    };
  };

  const buildPromptOptimizer = () => {
    const prompt = actionInputs.prompt?.trim();
    if (!prompt) return null;
    const goal = actionInputs.goal?.trim() || 'Improve clarity and policy compliance.';
    const tone = actionInputs.tone?.trim() || 'Helpful, confident, and concise.';
    return {
      system: buildSystemPrompt(
        'Rewrite prompts to improve clarity, safety, and outcomes. Ask clarifying questions if anything is ambiguous.'
      ),
      user: `Goal: ${goal}\nDesired tone: ${tone}\nOriginal prompt:\n${prompt}\n\nProvide the improved prompt and a short changelog.`,
    };
  };

  const buildScorerDraft = () => {
    const criteria = actionInputs.criteria?.trim();
    if (!criteria) return null;
    return {
      system: buildSystemPrompt(
        'Draft a criteria-based scorer with checklist items and scoring guidance. Ask clarifying questions if needed.'
      ),
      user: `Criteria to cover:\n${criteria}\nProvide a checklist (yes/no) and an overall scoring rubric.`,
    };
  };

  const buildDatasetIdeas = () => {
    const domain = actionInputs.domain?.trim();
    if (!domain) return null;
    return {
      system: buildSystemPrompt(
        'Suggest dataset rows that test edge cases and realistic scenarios. Ask clarifying questions if needed.'
      ),
      user: `Domain: ${domain}\nGenerate 6 dataset row ideas with input, expected behavior, and tags.`,
    };
  };

  const buildExperimentSummary = async () => {
    const experimentId = actionInputs.experiment_id?.trim();
    if (!experimentId) return null;
    const experiment = experiments.find((exp: any) => exp.id === experimentId);
    const versions = await api.getExperimentVersions(experimentId);
    const latestVersion = [...versions].sort((a, b) => (b.created_at || 0) - (a.created_at || 0))[0];
    if (!latestVersion) {
      throw new Error('No experiment versions found.');
    }
    const runs = await api.getVersionRuns(experimentId, latestVersion.id);
    const latestRun = [...runs].sort((a, b) => (b.created_at || 0) - (a.created_at || 0))[0];
    if (!latestRun) {
      throw new Error('No experiment runs found.');
    }
    return {
      system: buildSystemPrompt(
        'Summarize experiment performance and recommend next actions. Ask clarifying questions if needed.'
      ),
      user: `Experiment: ${experiment?.name || experimentId}\nRun summary:\n${JSON.stringify(
        latestRun.summary || {},
        null,
        2
      )}\nProvide a concise summary and 3 next steps.`,
    };
  };

  const handleRunAction = async () => {
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
        const lines = result.results.map((item: any) => `- ${item.path}:${item.line} ${item.snippet}`);
        const content = lines.length ? lines.join('\n') : 'No matching docs found.';
        appendMessages([
          { id: makeId('msg'), role: 'user', content: `Search docs: ${query}`, createdAt: Date.now() },
          { id: makeId('msg'), role: 'assistant', content, createdAt: Date.now() },
        ]);
      } catch (error: any) {
        setActionError(error?.message || 'Docs search failed');
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      let prompt = null;
      if (activeAction === 'aql') prompt = buildAqlPrompt();
      if (activeAction === 'prompt') prompt = buildPromptOptimizer();
      if (activeAction === 'scorer') prompt = buildScorerDraft();
      if (activeAction === 'dataset') prompt = buildDatasetIdeas();
      if (activeAction === 'experiment') prompt = await buildExperimentSummary();

      if (!prompt) {
        setActionError('Please fill in the required fields.');
        return;
      }
      await sendOwlMessage(prompt.system, prompt.user);
    } catch (error: any) {
      setActionError(error?.message || 'Action failed');
    }
  };

  const handleSendChat = async () => {
    const message = chatInput.trim();
    if (!message) return;
    setChatInput('');
    await sendOwlMessage(
      buildSystemPrompt('Answer concisely and offer next steps the user can take in the UI.'),
      message
    );
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-3">
      {isOpen && (
        <div className="w-[360px] max-w-[calc(100vw-2rem)] h-[540px] max-h-[calc(100vh-2rem)] bg-panel border border-border-base rounded-xl shadow-xl flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-base">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-text-muted font-bold">Owl</div>
              <div className="text-[11px] text-text-muted">Guided help for {pageLabel}</div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsOpen(false)}
              className="h-8 w-8 p-0"
              aria-label="Close Owl"
            >
              <XMarkIcon className="w-4 h-4" />
            </Button>
          </div>

          <div className="px-3 py-3 border-b border-border-base space-y-2 bg-panel/70">
            <div className="flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-widest text-text-muted font-bold">Playbook</div>
              <Badge variant="neutral">{activeAction}</Badge>
            </div>
            <Select
              value={activeAction}
              onChange={(e) => {
                setActiveAction(e.target.value as OwlActionId);
                setActionError(null);
              }}
              className="text-xs"
            >
              {OWL_ACTIONS.map((action) => (
                <option key={action.id} value={action.id}>
                  {action.title}
                </option>
              ))}
            </Select>
            <div className="text-[11px] text-text-muted">
              {OWL_ACTIONS.find((action) => action.id === activeAction)?.description}
            </div>

            {activeAction === 'aql' && (
              <Textarea
                value={actionInputs.question || ''}
                onChange={(e) => setActionInputs((prev) => ({ ...prev, question: e.target.value }))}
                placeholder="What do you want to learn from logs?"
                className="text-xs h-20 resize-none"
              />
            )}
            {activeAction === 'prompt' && (
              <div className="space-y-2">
                <Textarea
                  value={actionInputs.prompt || ''}
                  onChange={(e) => setActionInputs((prev) => ({ ...prev, prompt: e.target.value }))}
                  placeholder="Paste the prompt to improve"
                  className="text-xs h-20 resize-none"
                />
                <Input
                  value={actionInputs.goal || ''}
                  onChange={(e) => setActionInputs((prev) => ({ ...prev, goal: e.target.value }))}
                  placeholder="Goal (optional)"
                  className="text-xs"
                />
                <Input
                  value={actionInputs.tone || ''}
                  onChange={(e) => setActionInputs((prev) => ({ ...prev, tone: e.target.value }))}
                  placeholder="Desired tone (optional)"
                  className="text-xs"
                />
              </div>
            )}
            {activeAction === 'scorer' && (
              <Textarea
                value={actionInputs.criteria || ''}
                onChange={(e) => setActionInputs((prev) => ({ ...prev, criteria: e.target.value }))}
                placeholder="List the criteria the scorer should enforce"
                className="text-xs h-20 resize-none"
              />
            )}
            {activeAction === 'dataset' && (
              <Textarea
                value={actionInputs.domain || ''}
                onChange={(e) => setActionInputs((prev) => ({ ...prev, domain: e.target.value }))}
                placeholder="Describe the dataset focus (scenario, product area, policy)"
                className="text-xs h-20 resize-none"
              />
            )}
            {activeAction === 'experiment' && (
              <Select
                value={actionInputs.experiment_id || ''}
                onChange={(e) => setActionInputs((prev) => ({ ...prev, experiment_id: e.target.value }))}
                className="text-xs"
              >
                <option value="">Select experiment</option>
                {experimentOptions.map((exp) => (
                  <option key={exp.value} value={exp.value}>
                    {exp.label}
                  </option>
                ))}
              </Select>
            )}
            {activeAction === 'docs' && (
              <Input
                value={actionInputs.docs_query || ''}
                onChange={(e) => setActionInputs((prev) => ({ ...prev, docs_query: e.target.value }))}
                placeholder="Search docs for..."
                className="text-xs"
              />
            )}

            {actionError && (
              <div className="text-xs text-rose-500 font-bold bg-rose-500/10 rounded-md p-2">
                {actionError}
              </div>
            )}

            <Button variant="primary" size="sm" onClick={handleRunAction} disabled={loading}>
              {loading ? 'Working...' : 'Run playbook'}
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 && (
              <div className="text-xs text-text-muted italic">
                Ask Owl a question or run a playbook to get started.
              </div>
            )}
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-xs ${
                    msg.role === 'user'
                      ? 'bg-primary/15 text-text-main'
                      : 'bg-panel-hover text-text-main border border-border-base'
                  }`}
                >
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-border-base p-3 space-y-2">
            <Textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask Owl about this page..."
              className="text-xs h-16 resize-none"
            />
            <div className="flex items-center justify-between">
              <div className="text-[10px] text-text-muted">
                Context: {contextSummary || 'Athena'}
              </div>
              <Button variant="secondary" size="sm" onClick={handleSendChat} disabled={loading}>
                Send
              </Button>
            </div>
          </div>
        </div>
      )}

      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white shadow-lg hover:bg-primary-hover"
          aria-label="Open Owl assistant"
          aria-expanded={isOpen}
        >
          <ChatBubbleLeftRightIcon className="w-4 h-4" />
          Owl
        </button>
      )}
    </div>
  );
};

export default OwlWidget;
