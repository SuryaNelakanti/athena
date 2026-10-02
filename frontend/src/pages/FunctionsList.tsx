import React from 'react';
import { CpuChipIcon, PlusIcon } from '@heroicons/react/24/outline';

import { Button } from '../components/ui';
import { useProject } from '../contexts/ProjectContext';
import { FunctionCatalog } from '../features/functions/FunctionCatalog';
import { FunctionCreateModal } from '../features/functions/FunctionCreateModal';
import { useFunctionCatalog } from '../features/functions/useFunctionCatalog';
import { PageHeader } from '../layouts/PageHeader';

const FILTER_OPTIONS = ['all', 'scorer', 'tool'] as const;

const FunctionsList: React.FC = () => {
  const { currentProject } = useProject();
  const catalog = useFunctionCatalog(currentProject?.id || '');

  return (
    <div className="h-full flex flex-col bg-app">
      <PageHeader
        title="Functions"
        subtitle="Scorers and tools for evaluation and automation"
        actions={(
          <Button
            variant="primary"
            size="sm"
            onClick={() => catalog.setIsCreateModalOpen(true)}
          >
            <PlusIcon className="w-3.5 h-3.5" />
            New Function
          </Button>
        )}
      />

      <div className="px-6 py-3 border-b border-border-hairline bg-panel flex items-center gap-3">
        <span className="text-xs text-text-muted font-medium">Filter:</span>
        <div className="flex gap-1">
          {FILTER_OPTIONS.map((filter) => (
            <button
              key={filter}
              onClick={() => catalog.setFilter(filter)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${catalog.filter === filter
                ? 'bg-primary/10 text-primary'
                : 'text-text-muted hover:bg-panel-hover hover:text-text-main'
              }`}
            >
              {filter === 'all' ? 'All' : `${filter.charAt(0).toUpperCase()}${filter.slice(1)}s`}
            </button>
          ))}
        </div>
        <div className="ml-auto text-xs text-text-muted">
          {catalog.filteredFunctions.length} function{catalog.filteredFunctions.length !== 1 ? 's' : ''}
        </div>
      </div>

      <FunctionCreateModal
        open={catalog.isCreateModalOpen}
        draft={catalog.draft}
        criteria={catalog.llmJudgeCriteria}
        error={catalog.createError}
        onDraftChange={catalog.updateDraft}
        onCriteriaChange={catalog.setLlmJudgeCriteria}
        onClose={() => catalog.setIsCreateModalOpen(false)}
        onCreate={() => void catalog.createFunction()}
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {catalog.actionError && (
          <p role="alert" className="text-sm text-rose-500">{catalog.actionError}</p>
        )}
        {catalog.loading ? (
          <div className="flex items-center justify-center py-20 text-text-muted text-sm animate-pulse">
            Loading functions...
          </div>
        ) : catalog.loadError ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-sm text-rose-500 mb-3">{catalog.loadError}</p>
            <Button variant="secondary" size="sm" onClick={catalog.retryLoad}>
              Retry
            </Button>
          </div>
        ) : catalog.filteredFunctions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 animate-soft-in">
            <div className="icon-chip icon-chip--indigo icon-chip-lg mb-4">
              <CpuChipIcon className="w-5 h-5" />
            </div>
            <h3 className="text-text-main font-semibold mb-1">No functions yet</h3>
            <p className="text-text-muted text-sm mb-4">
              Create scorers and tools for your evaluations
            </p>
            <Button
              variant="primary"
              size="sm"
              onClick={() => catalog.setIsCreateModalOpen(true)}
            >
              <PlusIcon className="w-3.5 h-3.5" />
              Create Function
            </Button>
          </div>
        ) : (
          <FunctionCatalog
            builtinFunctions={catalog.builtinFunctions}
            customFunctions={catalog.customFunctions}
            onDelete={(functionId) => void catalog.deleteFunction(functionId)}
          />
        )}
      </div>
    </div>
  );
};

export default FunctionsList;
