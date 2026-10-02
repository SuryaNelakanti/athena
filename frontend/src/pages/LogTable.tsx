import React, { useState } from 'react';

import { LogFilterToolbar } from '../features/logs/LogFilterToolbar';
import { LogResultsTable } from '../features/logs/LogResultsTable';
import { useLogTableData } from '../features/logs/useLogTableData';
import type { Filter } from '../features/logs/filterConfig';
import { useProject } from '../contexts/ProjectContext';
import { PageHeader } from '../layouts/PageHeader';
import type { Log } from '../types';

interface LogTableProps {
  onSelectLog: (log: Log) => void;
  onOpenTrace?: (traceId: string) => void;
  selectedLogId: string | null;
}

const LogTable: React.FC<LogTableProps> = ({
  onSelectLog,
  onOpenTrace,
  selectedLogId,
}) => {
  const { currentProject } = useProject();
  const projectId = currentProject?.id || '';
  const [filters, setFilters] = useState<Filter[]>([]);
  const {
    logs,
    loading,
    error,
    traceLineage,
    lineageLoading,
    lineageError,
    refreshLogs,
  } = useLogTableData({ projectId, filters, selectedLogId, onOpenTrace });

  return (
    <div className="flex flex-col h-full transition-colors duration-300">
      <PageHeader
        title="Logs"
        subtitle="Search, filter, and analyze system traces and spans."
        className="pb-0 border-b-0"
      />
      <LogFilterToolbar
        projectId={projectId}
        logs={logs}
        filters={filters}
        setFilters={setFilters}
        logError={error}
        onRefreshLogs={refreshLogs}
      />
      <LogResultsTable
        logs={logs}
        loading={loading}
        selectedLogId={selectedLogId}
        traceLineage={traceLineage}
        lineageLoading={lineageLoading}
        onSelectLog={onSelectLog}
        onOpenTrace={onOpenTrace}
      />
      {lineageError && (
        <div role="alert" className="px-6 py-2 text-xs text-rose-500 border-t border-border-hairline">
          {lineageError}
        </div>
      )}
    </div>
  );
};

export default LogTable;
