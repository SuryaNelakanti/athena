import { useRef, useState } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { api } from '../lib/api';
import { getErrorMessage } from '../lib/errors';
import { usePromptTestDetailData } from '../features/prompt-tests/usePromptTestDetailData';
import { PageHeader } from '../layouts/PageHeader';
import { Badge, Card, Button } from '../components/ui';
import { PlayIcon } from '@heroicons/react/24/outline';
import { extractExpected, extractOutputText, extractText } from '../lib/structuredData';

const PromptTestDetail = () => {
    const { promptTestId } = useParams({ from: '/prompt-tests/$promptTestId' });
    const navigate = useNavigate();
    const {
        test,
        results,
        rows,
        loading,
        error,
        markPendingAndRefresh,
    } = usePromptTestDetailData(promptTestId);
    const promptTestIdRef = useRef(promptTestId);
    promptTestIdRef.current = promptTestId;
    const [actionError, setActionError] = useState<{ testId: string; message: string } | null>(null);
    const currentTest = test?.id === promptTestId ? test : null;
    const currentResults = currentTest ? results : [];
    const currentRows = currentTest ? rows : {};

    const handleRerun = async () => {
        if (!currentTest) return;
        const testId = currentTest.id;
        setActionError(null);
        try {
            await api.runPromptTest(testId);
            if (promptTestIdRef.current === testId) {
                markPendingAndRefresh(testId);
            }
        } catch (cause: unknown) {
            if (promptTestIdRef.current === testId) {
                setActionError({
                    testId,
                    message: getErrorMessage(cause, 'Failed to rerun prompt test.'),
                });
            }
        }
    };

    if (loading && !currentTest) {
        return <div className="flex items-center justify-center h-full text-text-muted">Loading...</div>;
    }

    if (!currentTest) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-text-muted">
                {error ? <div role="alert" className="text-rose-600">{error}</div> : 'Test not found'}
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col">
            {(error || actionError?.testId === promptTestId) && (
                <div role="alert" className="mx-6 mt-4 text-rose-600">
                    {error || actionError?.message}
                </div>
            )}
            <PageHeader
                title={currentTest.name || 'Untitled Prompt Test'}
                subtitle={`ID: ${currentTest.id}`}
                onBack={() => navigate({ to: '/experiments' })} // Navigate back to experiments/prompt-tests list
                badge={
                    <Badge variant={
                        currentTest.status === 'completed' ? 'success' :
                            currentTest.status === 'error' ? 'danger' :
                                currentTest.status === 'running' ? 'primary' : 'neutral'
                    }>
                        {currentTest.status}
                    </Badge>
                }
                actions={
                    <Button
                        disabled={currentTest.status === 'running' || currentTest.status === 'pending'}
                        onClick={handleRerun}
                        variant="primary"
                        size="sm"
                    >
                        <PlayIcon className="w-4 h-4" /> Rerun
                    </Button>
                }
            />

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {/* Stats / Summary */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className="p-4">
                        <div className="text-xs text-text-muted uppercase tracking-wider">Progress</div>
                        <div className="text-xl font-bold mt-1">
                            {currentTest.summary?.rows_done || 0} / {Object.keys(currentRows).length || '?'}
                        </div>
                    </Card>
                    <Card className="p-4">
                        <div className="text-xs text-text-muted uppercase tracking-wider">Pass Rate</div>
                        <div className="text-xl font-bold mt-1">
                            {/* Calculate pass rate if we define pass */}
                            {currentResults.length > 0 ?
                                `${(currentResults.filter(r => !r.error).length / currentResults.length * 100).toFixed(1)}%` // This is just success rate (no error)
                                : '-'
                            }
                        </div>
                    </Card>
                    <Card className="p-4">
                        <div className="text-xs text-text-muted uppercase tracking-wider">Avg Latency</div>
                        <div className="text-xl font-bold mt-1">
                            {currentResults.length > 0
                                ? (currentResults.reduce((acc, r) => acc + (r.latency_ms || 0), 0) / currentResults.length).toFixed(0) + 'ms'
                                : '-'
                            }
                        </div>
                    </Card>
                </div>

                {/* Results List */}
                <div className="space-y-3">
                    {currentResults.map((result) => {
                        const row = currentRows[result.dataset_row_id];
                        const inputText = extractText(row?.input);
                        const expectedText = extractExpected(row?.expected);
                        const outputText = extractOutputText(result.output);

                        return (
                            <Card key={result.id} className="p-4">
                                <div className="flex items-start gap-4">
                                    <div className="flex-1">
                                        <div className="mb-2">
                                            <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-1 rounded">Input</span>
                                            <p className="text-sm mt-1 whitespace-pre-wrap">{inputText}</p>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4 mt-2">
                                            <div>
                                                <span className="text-xs font-bold text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded">Expected</span>
                                                <p className="text-sm mt-1 text-text-muted whitespace-pre-wrap">{expectedText}</p>
                                            </div>
                                            <div>
                                                <span className="text-xs font-bold text-amber-500 bg-amber-500/10 px-2 py-1 rounded">Actual Output</span>
                                                {result.error ? (
                                                    <p className="text-sm mt-1 text-rose-500 font-mono">{result.error}</p>
                                                ) : (
                                                    <p className="text-sm mt-1 whitespace-pre-wrap">{outputText}</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="w-32 text-right">
                                        <div className="text-xs text-text-muted mb-2">{result.latency_ms}ms</div>
                                        {Object.entries(result.scores || {}).map(([name, score]) => (
                                            <div key={name} className="flex items-center justify-end gap-2 mb-1">
                                                <span className="text-[10px] uppercase text-text-muted truncate max-w-[60px]" title={name}>{name}</span>
                                                <Badge variant={Number(score) >= 0.8 ? 'success' : Number(score) > 0.4 ? 'warning' : 'danger'}>
                                                    {Number(score).toFixed(2)}
                                                </Badge>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </Card>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default PromptTestDetail;
