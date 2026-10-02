import { useState, useEffect } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useProject } from '../contexts/ProjectContext';
import type { DatasetVersion } from '../types';
import { MagnifyingGlassIcon, PlusIcon, LinkIcon, BeakerIcon } from '@heroicons/react/24/outline';
import { PromptTestModal } from '../components/PromptTestModal';
import { Badge, Button, Card, Input, Tabs } from '../components/ui';
import { PageHeader } from '../layouts/PageHeader';
import { extractExpected, extractText } from '../lib/structuredData';
import { useDatasetDetailData } from '../features/datasets/useDatasetDetailData';
import { useDatasetRowCreation } from '../features/datasets/useDatasetRowCreation';
import { DatasetRowCreateModal } from '../features/datasets/DatasetRowCreateModal';
import DatasetRowsPanel from '../features/datasets/DatasetRowsPanel';
import DatasetHistoryPanel from '../features/datasets/DatasetHistoryPanel';
import { getDatasetEvalLabel, getDatasetRowKind } from '../features/datasets/datasetRowUtils';
import ShareLinkModal from '../features/collaboration/ShareLinkModal';
import { useShareLink } from '../features/collaboration/useShareLink';

const MAIN_TABS = [
    { id: 'eval', label: 'Eval' },
    { id: 'resources', label: 'Resources' },
    { id: 'history', label: 'History' },
];

const FILTER_TABS = [
    { id: 'all', label: 'All' },
    { id: 'gold', label: 'Gold' },
    { id: 'anti_pattern', label: 'Anti-Pattern' },
];

const DatasetDetail = () => {
    const { currentProject } = useProject();
    const projectId = currentProject?.id || '';
    const { datasetId } = useParams({ from: '/datasets/$datasetId' });
    const navigate = useNavigate();
    const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState<'all' | 'gold' | 'anti_pattern'>('all');
    const [activeTab, setActiveTab] = useState<'eval' | 'resources' | 'history'>('eval');
    const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
    const {
        dataset,
        rows,
        loading,
        datasetLoading,
        datasetError,
        rowsError,
        history,
        historyLoading,
        historyError,
        rowHistory,
        rowHistoryErrors,
        loadRows,
        loadHistory,
        loadRowHistory,
    } = useDatasetDetailData(datasetId, activeTab);
    const rowCreation = useDatasetRowCreation(dataset, activeTab, loadRows);
    const shareLink = useShareLink(dataset ? {
        projectId: dataset.project_id,
        objectType: 'dataset',
        objectId: dataset.id,
    } : null, { clipboardUnavailableMessage: 'Clipboard access is unavailable.' });

    // Prompt Test State
    const [showPromptTest, setShowPromptTest] = useState(false);

    useEffect(() => {
        setExpandedHistoryId(null);
    }, [datasetId]);

    const handleToggleHistory = async (entry: DatasetVersion) => {
        if (expandedHistoryId === entry.id) {
            setExpandedHistoryId(null);
            return;
        }
        setExpandedHistoryId(entry.id);
        if (!dataset) return;
        if (entry.logical_id && !rowHistory[entry.logical_id]) {
            await loadRowHistory(dataset.id, entry.logical_id);
        }
    };

    // Filter rows
    const filteredRows = rows.filter(row => {
        const rowKind = getDatasetRowKind(row);
        const evalLabel = getDatasetEvalLabel(row);

        if (activeTab === 'eval' && rowKind !== 'eval') return false;
        if (activeTab === 'resources' && rowKind !== 'resource') return false;

        if (activeTab === 'eval' && filterType !== 'all' && evalLabel !== filterType) return false;

        if (!searchQuery.trim()) return true;
        const input = extractText(row.input).toLowerCase();
        const expected = extractExpected(row.expected).toLowerCase();
        return input.includes(searchQuery.toLowerCase()) || expected.includes(searchQuery.toLowerCase());
    });

    const evalRows = rows.filter((row) => getDatasetRowKind(row) === 'eval');
    const goldCount = evalRows.filter((row) => getDatasetEvalLabel(row) === 'gold').length;
    const antiPatternCount = evalRows.filter((row) => getDatasetEvalLabel(row) === 'anti_pattern').length;
    const resourceCount = rows.filter((row) => getDatasetRowKind(row) === 'resource').length;
    const isEvalTab = activeTab === 'eval';
    const isResourceTab = activeTab === 'resources';

    if (!datasetId) {
        return <div className="flex items-center justify-center h-full text-text-muted">Dataset not found.</div>;
    }

    if (datasetLoading) {
        return <div className="flex items-center justify-center h-full text-text-muted">Loading dataset...</div>;
    }

    if (!dataset) {
        return <div className="flex items-center justify-center h-full text-text-muted">{datasetError || 'Dataset not found.'}</div>;
    }

    return (
        <>
          <div className="h-full flex flex-col">

            <div className="border-b border-border-hairline shrink-0">
                <PageHeader
                    title={dataset.name}
                    subtitle={dataset.description}
                    onBack={() => navigate({ to: '/datasets' })}
                    badge={<div className="flex items-center gap-2 text-xs text-text-muted font-medium mt-0.5">
                        <Badge variant="primary">v{dataset.version}</Badge>
                        {dataset.kind && (
                            <Badge variant="outline" className="uppercase">
                                {dataset.kind}
                            </Badge>
                        )}
                        {(goldCount > 0 || antiPatternCount > 0 || resourceCount > 0) && <span>|</span>}
                        {goldCount > 0 && <span className="text-emerald-500">{goldCount} gold</span>}
                        {antiPatternCount > 0 && (
                            <>
                                <span>|</span>
                                <span className="text-rose-500">{antiPatternCount} anti-patterns</span>
                            </>
                        )}
                        {resourceCount > 0 && (
                            <>
                                <span>|</span>
                                <span className="text-sky-500">{resourceCount} resources</span>
                            </>
                        )}
                    </div>}
                    actions={activeTab !== 'history' && (
                        <div className="flex items-center gap-2">
                            <Button
                                onClick={() => setShowPromptTest(true)}
                                variant="secondary"
                                size="sm"
                                className="mr-2"
                            >
                                <BeakerIcon className="w-4 h-4" /> Test Prompt
                            </Button>
                            <Button
                                onClick={() => void shareLink.open()}
                                variant="secondary"
                                size="sm"
                            >
                                <LinkIcon className="w-4 h-4" /> Share
                            </Button>
                            <Button
                                onClick={() => rowCreation.setIsOpen(true)}
                                variant="primary"
                                size="sm"
                            >
                                <PlusIcon className="w-4 h-4" /> {activeTab === 'resources' ? 'Add Resource' : 'Add Eval Row'}
                            </Button>
                        </div>
                    )}
                    className="pb-0 border-b-0" />
            </div>

            <div className="px-8 pb-4 pt-4">
                <Card className="bg-primary/5 border-primary/20">
                    <h4 className="text-sm font-bold text-text-main mb-1">What is this dataset?</h4>
                    <p className="text-xs text-text-muted leading-relaxed">
                        Eval rows store <strong className="text-primary">Inputs</strong> and <strong className="text-emerald-500">Expected Outputs</strong>.
                        <strong className="text-emerald-500 ml-1">Gold</strong> entries are correct behaviors.
                        <strong className="text-rose-500 ml-1">Anti-patterns</strong> are outputs the AI should avoid.
                        <span className="ml-1">Resources store reference material for context.</span>
                    </p>
                </Card>
            </div>

            <div className="px-8 pb-4">
                <Tabs
                    options={MAIN_TABS}
                    value={activeTab}
                    onChange={(value) => setActiveTab(value as 'eval' | 'resources' | 'history')} />
            </div>

            {activeTab !== 'history' && (
                <div className="px-8 pb-4 flex gap-4">
                    <div className="relative flex-1">
                        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                        <Input
                            type="text"
                            placeholder={activeTab === 'resources' ? 'Search resources...' : 'Search eval rows...'}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10" />
                    </div>
                    {activeTab === 'eval' && (
                        <Tabs
                            options={FILTER_TABS}
                            value={filterType}
                            onChange={(value) => setFilterType(value as 'all' | 'gold' | 'anti_pattern')} />
                    )}
                </div>
            )}
            <div className="flex-1 overflow-y-auto p-6">
                {activeTab !== 'history' ? (
                    <DatasetRowsPanel
                        rows={filteredRows}
                        loading={loading}
                        error={rowsError}
                        isResourceTab={isResourceTab}
                        searchQuery={searchQuery}
                        expandedRowId={expandedRowId}
                        onRetry={() => void loadRows(dataset)}
                        onAddRow={() => rowCreation.setIsOpen(true)}
                        onToggleRow={(rowId) => setExpandedRowId(rowId)}
                    />
                ) : (
                    <DatasetHistoryPanel
                        history={history}
                        loading={historyLoading}
                        error={historyError}
                        rowHistory={rowHistory}
                        rowHistoryErrors={rowHistoryErrors}
                        expandedHistoryId={expandedHistoryId}
                        onToggleHistory={(entry) => void handleToggleHistory(entry)}
                        onRetryHistory={() => void loadHistory(dataset)}
                        onRetryRowHistory={(logicalId) => void loadRowHistory(dataset.id, logicalId)}
                    />
                )}
            </div>
        </div>

            {/* Prompt Test Modal */}
            <PromptTestModal
                open={showPromptTest}
                onClose={() => setShowPromptTest(false)}
                projectId={projectId}
                datasetId={dataset?.id || ''}
                onSuccess={(testId: string) => {
                    navigate({ to: '/prompt-tests/$promptTestId', params: { promptTestId: testId } });
                    setShowPromptTest(false);
                }}
            />

            <DatasetRowCreateModal
                open={rowCreation.isOpen}
                isEvalTab={isEvalTab}
                isResourceTab={isResourceTab}
                draft={rowCreation.draft}
                error={rowCreation.error}
                onDraftChange={rowCreation.updateDraft}
                onClose={() => rowCreation.setIsOpen(false)}
                onSubmit={() => void rowCreation.addRow()}
            />

            <ShareLinkModal
                open={shareLink.isOpen}
                title="Share Dataset"
                description="Create a public link to share this dataset with others."
                audienceDescription="Anyone with this link can view this dataset."
                loading={shareLink.isLoading}
                error={shareLink.error}
                url={shareLink.url}
                copied={shareLink.isCopied}
                onClose={shareLink.close}
                onCopy={() => void shareLink.copy()}
            />
        </>
    );
};

export default DatasetDetail;
