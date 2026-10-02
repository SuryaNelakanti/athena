import React, { useMemo, useState } from 'react';
import { Button, Textarea } from '../../components/ui';
import { ChatBubbleLeftRightIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { OwlPlaybookPanel } from './OwlPlaybookPanel';
import { useOwlExperiments } from './useOwlExperiments';
import { useOwlAssistant } from './useOwlAssistant';

interface OwlWidgetProps {
  projectId: string;
  projectName?: string;
  currentPath: string;
  routeParams?: Record<string, string>;
}

const pageLabelForPath = (path: string) => {
  if (path === '/') return 'Dashboard';
  if (path.startsWith('/sessions')) return 'Agent Runs';
  if (path.startsWith('/runs')) return 'Run Detail';
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
  const [playbookExpanded, setPlaybookExpanded] = useState(false);
  const {
    experiments,
    loading: experimentsLoading,
    error: experimentsError,
    options: experimentOptions,
    reload: reloadExperiments,
  } = useOwlExperiments(projectId);

  const routeParamEntries = useMemo(
    () => Object.entries(routeParams).filter(([, value]) => value),
    [routeParams]
  );

  const pageLabel = useMemo(() => pageLabelForPath(currentPath), [currentPath]);

  // Build context object for backend
  const pageContext = useMemo(() => ({
    page: pageLabel,
    route: currentPath,
    project_name: projectName || projectId,
    params: Object.fromEntries(routeParamEntries),
  }), [pageLabel, currentPath, projectName, projectId, routeParamEntries]);

  const contextSummary = useMemo(() => {
    const parts = [pageLabel];
    if (routeParamEntries.length) {
      parts.push(routeParamEntries.map(([key, value]) => `${key}=${value}`).join(', '));
    }
    return parts.filter(Boolean).join(' | ');
  }, [pageLabel, routeParamEntries]);

  const {
    activeAction,
    actionInputs,
    chatInput,
    messages,
    loading,
    actionError,
    setChatInput,
    changeAction,
    updateActionInput,
    runAction,
    sendChat,
  } = useOwlAssistant({ projectId, projectName, pageContext, experiments });

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-3">
      {isOpen && (
        <div className="w-[360px] max-w-[calc(100vw-2rem)] h-[540px] max-h-[calc(100vh-2rem)] bg-panel border border-border-base rounded-xl shadow-xl flex flex-col overflow-hidden animate-soft-in">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-base bg-panel">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
                <ChatBubbleLeftRightIcon className="w-3.5 h-3.5 text-primary" />
              </div>
              <div>
                <div className="text-xs font-semibold text-text-main">Owl Assistant</div>
                <div className="text-[10px] text-text-muted">{pageLabel}</div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsOpen(false)}
              className="h-7 w-7 p-0"
              aria-label="Close Owl"
            >
              <XMarkIcon className="w-4 h-4" />
            </Button>
          </div>

          <OwlPlaybookPanel
            activeAction={activeAction}
            actionInputs={actionInputs}
            experimentOptions={experimentOptions}
            experimentsLoading={experimentsLoading}
            experimentsError={experimentsError}
            actionError={actionError}
            loading={loading}
            isExpanded={playbookExpanded}
            onActionChange={changeAction}
            onInputChange={updateActionInput}
            onToggle={() => setPlaybookExpanded((expanded) => !expanded)}
            onRetryExperiments={reloadExperiments}
            onRun={runAction}
          />
          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 && (
              <div className="text-center py-8">
                <div className="w-10 h-10 rounded-full bg-primary/10 mx-auto mb-3 flex items-center justify-center">
                  <ChatBubbleLeftRightIcon className="w-5 h-5 text-primary" />
                </div>
                <div className="text-xs text-text-muted">
                  Ask Owl a question about {pageLabel.toLowerCase()} or expand Playbooks for guided workflows.
                </div>
              </div>
            )}
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-xs ${msg.role === 'user'
                    ? 'bg-primary/15 text-text-main'
                    : 'bg-panel-hover text-text-main border border-border-hairline'
                    }`}
                >
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Chat Input */}
          <div className="border-t border-border-base p-3 space-y-2 bg-panel">
            <Textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask Owl anything..."
              className="text-xs h-14 resize-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendChat();
                }
              }}
            />
            <div className="flex items-center justify-between">
              <div className="text-[9px] text-text-muted truncate max-w-[180px]">
                {contextSummary || 'Athena'}
              </div>
              <Button variant="primary" size="sm" onClick={sendChat} disabled={loading}>
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
          className="flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-xs font-semibold text-white shadow-lg hover:bg-primary-hover transition-all hover:scale-105"
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
