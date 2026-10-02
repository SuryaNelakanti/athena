import React from 'react';
import { ClockIcon, CurrencyDollarIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { Badge } from '../../components/ui';
import { RunGraphNode } from '../../types';
import { statusVariant, stringList } from './runNarrativeUtils';

interface RunNodeInspectorProps {
    node: RunGraphNode;
}

const firstString = (...values: unknown[]): string | undefined =>
    values.find((value): value is string => typeof value === 'string' && value.length > 0);

const asRecord = (value: unknown): Record<string, unknown> | null =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;

const JsonBlock: React.FC<{ value: unknown; maxHeightClass?: string; muted?: boolean }> = ({
    value,
    maxHeightClass = 'max-h-[300px]',
    muted = false,
}) => (
    <div className="bg-app border border-border-hairline rounded-lg overflow-hidden">
        <pre className={`text-xs ${muted ? 'text-text-muted' : 'text-text-main'} p-3 font-mono whitespace-pre-wrap ${maxHeightClass} overflow-y-auto`}>
            {JSON.stringify(value ?? {}, null, 2)}
        </pre>
    </div>
);

const SchemaIssues: React.FC<{ errors: string[] }> = ({ errors }) => errors.length > 0 ? (
    <div className="p-3 rounded-lg border border-amber-400/40 bg-amber-500/10 text-amber-700 text-xs">
        <span className="font-semibold uppercase tracking-widest text-[10px]">Schema issues</span>
        <ul className="mt-1 list-disc list-inside">
            {errors.map((error, index) => <li key={`${error}-${index}`}>{error}</li>)}
        </ul>
    </div>
) : null;

const RunNodeInspector: React.FC<RunNodeInspectorProps> = ({ node }) => {
    const attributes = node.attributes || {};
    const input = node.input || {};
    const output = node.output || {};

    const toolDetails = node.kind === 'tool_call' ? {
        name: firstString(attributes.tool_name, attributes.tool) || node.name,
        args: attributes.tool_args ?? node.input,
        result: attributes.tool_result ?? node.output,
        errors: stringList(attributes.tool_schema_errors),
        status: firstString(attributes.tool_status) || node.status,
        durationMs: typeof attributes.tool_duration_ms === 'number' ? attributes.tool_duration_ms : undefined,
    } : null;

    const docsValue = output.documents || output.docs || output.results || [];
    const docs: unknown[] = Array.isArray(docsValue) ? docsValue : [];
    const retrievalDetails = node.kind === 'retrieval' ? {
        query: firstString(attributes.retrieval_query, input.query, input.text, input.prompt) || '',
        docs,
        errors: stringList(attributes.retrieval_schema_errors),
        citations: attributes.retrieval_citations || output.citations || null,
        topK: typeof attributes.retrieval_top_k === 'number' && attributes.retrieval_top_k !== 0
            ? attributes.retrieval_top_k
            : docs.length,
    } : null;

    const reasoningContent = firstString(
        attributes.reasoning_content,
        output.athena_reasoning,
        output.reasoning,
        output.reasoning_content
    );

    return (
        <div className="p-5 space-y-6">
            <div>
                <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold mb-1">{node.kind}</div>
                <h2 className="text-lg font-bold text-text-main break-words">{node.name}</h2>
                <div className="flex items-center gap-2 mt-3">
                    <Badge variant={statusVariant(node.status)}>{node.status}</Badge>
                    <span className="text-xs text-text-muted font-mono">{node.id.slice(0, 8)}</span>
                </div>
            </div>

            {node.error_message && (
                <div className="p-4 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg">
                    <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 mb-2">
                        <ExclamationTriangleIcon className="w-4 h-4" />
                        <span className="text-xs font-bold uppercase tracking-wide">Error</span>
                    </div>
                    <p className="text-sm text-rose-700 dark:text-rose-300 font-mono text-xs whitespace-pre-wrap">
                        {node.error_message}
                    </p>
                </div>
            )}

            <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-app rounded-lg border border-border-hairline">
                    <div className="flex items-center gap-2 text-text-muted mb-1">
                        <ClockIcon className="w-3.5 h-3.5" />
                        <span className="text-[10px] uppercase tracking-widest font-semibold">Duration</span>
                    </div>
                    <div className="text-sm font-mono font-medium text-text-main">{Math.round(node.duration_ms)}ms</div>
                </div>
                <div className="p-3 bg-app rounded-lg border border-border-hairline">
                    <div className="flex items-center gap-2 text-text-muted mb-1">
                        <CurrencyDollarIcon className="w-3.5 h-3.5" />
                        <span className="text-[10px] uppercase tracking-widest font-semibold">Cost</span>
                    </div>
                    <div className="text-sm font-mono font-medium text-text-main">
                        ${node.metrics?.total_cost?.toFixed(6) ?? '0.000'}
                    </div>
                </div>
            </div>

            {toolDetails && (
                <section className="space-y-3">
                    <span className="text-[10px] uppercase tracking-widest text-text-muted font-bold">Tool Call</span>
                    <div className="grid grid-cols-2 gap-3">
                        <Detail label="Tool" value={toolDetails.name || 'unknown'} />
                        <Detail label="Status" value={toolDetails.status} />
                        <Detail label="Duration" value={toolDetails.durationMs ? `${Math.round(toolDetails.durationMs)}ms` : 'n/a'} />
                    </div>
                    <SchemaIssues errors={toolDetails.errors} />
                    <DetailJson label="Args" value={toolDetails.args} maxHeightClass="max-h-[240px]" />
                    <DetailJson label="Result" value={toolDetails.result} maxHeightClass="max-h-[240px]" />
                </section>
            )}

            {retrievalDetails && (
                <section className="space-y-3">
                    <span className="text-[10px] uppercase tracking-widest text-text-muted font-bold">Retrieval</span>
                    <Detail label="Query" value={retrievalDetails.query || 'n/a'} />
                    <SchemaIssues errors={retrievalDetails.errors} />
                    <div className="space-y-2">
                        <span className="text-[10px] uppercase tracking-widest text-text-muted font-bold">
                            Documents ({retrievalDetails.topK})
                        </span>
                        <div className="space-y-2">
                            {retrievalDetails.docs.length === 0 ? (
                                <div className="text-xs text-text-muted">No documents captured.</div>
                            ) : retrievalDetails.docs.map((docValue, index) => (
                                <RetrievalDocument key={retrievalDocumentKey(docValue, index)} value={docValue} index={index} />
                            ))}
                        </div>
                    </div>
                    {retrievalDetails.citations && (
                        <DetailJson label="Citations" value={retrievalDetails.citations} maxHeightClass="max-h-[200px]" />
                    )}
                </section>
            )}

            {reasoningContent && (
                <section className="space-y-2">
                    <span className="text-[10px] uppercase tracking-widest text-text-muted font-bold">Reasoning</span>
                    <div className="bg-app border border-border-hairline rounded-lg overflow-hidden">
                        <pre className="text-xs text-text-main p-3 font-mono whitespace-pre-wrap max-h-[260px] overflow-y-auto">
                            {reasoningContent}
                        </pre>
                    </div>
                </section>
            )}

            <div className="space-y-4">
                <DetailJson label="Input" value={node.input} />
                <DetailJson label="Output" value={node.output} />
            </div>

            {node.causal_chain && node.causal_chain.length > 0 && (
                <section className="space-y-2 pt-4 border-t border-border-hairline">
                    <span className="text-[10px] uppercase tracking-widest text-text-muted font-bold">Causal Chain</span>
                    <div className="space-y-1">
                        {node.causal_chain.map((ancestor, index) => (
                            <div key={ancestor.id} className="text-xs px-3 py-2 rounded-lg border border-border-hairline bg-app flex items-center justify-between">
                                <span className="font-mono text-text-muted">{index + 1}. {ancestor.name}</span>
                                <Badge variant={statusVariant(ancestor.status)} size="sm">{ancestor.status}</Badge>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {Object.keys(attributes).length > 0 && (
                <DetailJson label="Attributes" value={attributes} maxHeightClass="max-h-[200px]" muted />
            )}
        </div>
    );
};

const Detail: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
    <div className="p-3 bg-app rounded-lg border border-border-hairline">
        <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold">{label}</div>
        <div className="text-sm font-mono text-text-main mt-1">{value}</div>
    </div>
);

const DetailJson: React.FC<{
    label: string;
    value: unknown;
    maxHeightClass?: string;
    muted?: boolean;
}> = ({ label, value, maxHeightClass, muted = false }) => (
    <div className="space-y-2">
        <span className="text-[10px] uppercase tracking-widest text-text-muted font-bold">{label}</span>
        <JsonBlock value={value} maxHeightClass={maxHeightClass} muted={muted} />
    </div>
);

const RetrievalDocument: React.FC<{ value: unknown; index: number }> = ({ value, index }) => {
    if (typeof value === 'string') {
        return <div className="p-3 bg-app rounded-lg border border-border-hairline text-xs text-text-main">{value}</div>;
    }

    const document = asRecord(value);
    if (!document) return null;

    const id = firstString(document.id, document.doc_id, document.document_id) || `doc_${index + 1}`;
    const score = [document.score, document.similarity, document.rank_score]
        .find((candidate): candidate is number => typeof candidate === 'number');
    const url = firstString(document.url, document.link, document.href);
    const title = firstString(document.title);
    const snippet = firstString(document.snippet);

    return (
        <div className="p-3 bg-app rounded-lg border border-border-hairline text-xs text-text-main">
            <div className="flex items-center justify-between">
                <span className="font-mono">{id}</span>
                {typeof score === 'number' && <span className="text-text-muted">score: {score.toFixed(3)}</span>}
            </div>
            {title && <div className="mt-1 text-text-muted">{title}</div>}
            {snippet && <div className="mt-1 text-text-muted">{snippet}</div>}
            {url && (
                <a href={url} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-primary hover:underline">
                    Open source
                </a>
            )}
        </div>
    );
};

const retrievalDocumentKey = (value: unknown, index: number): string => {
    if (typeof value === 'string') return `${value}-${index}`;
    const document = asRecord(value);
    const id = document ? firstString(document.id, document.doc_id, document.document_id) : undefined;
    return `${id || `doc_${index + 1}`}-${index}`;
};

export default RunNodeInspector;
