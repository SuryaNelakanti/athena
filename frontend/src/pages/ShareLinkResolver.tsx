import React, { useState, useEffect } from 'react';
import { useParams, useSearch, useNavigate } from '@tanstack/react-router';
import { useProject } from '../contexts/ProjectContext';
import { api } from '../lib/api';
import { getErrorMessage } from '../lib/errors';
import { Card } from '../components/ui';



export const ShareLinkResolver: React.FC = () => {
    const { projects, setCurrentProject: onProjectResolved } = useProject();
    const { token } = useParams({ from: '/share-links/$token' });
    const search = useSearch({ from: '/share-links/$token' });
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!token) {
            setError('Missing share token.');
            setLoading(false);
            return;
        }

        let canceled = false;
        const resolve = async () => {
            try {
                const link = await api.getShareLink(token);
                if (canceled) return;

                if (link.project_id) {
                    const match = projects.find((p) => p.id === link.project_id);
                    if (match) {
                        onProjectResolved(match);
                    } else {
                        try {
                            const fetched = await api.getProject(link.project_id);
                            if (!canceled && fetched) {
                                onProjectResolved(fetched);
                            }
                        } catch {
                            // Ignore project fetch errors.
                        }
                    }
                }

                const resultId = search.result || search.experiment_result_id || undefined;

                if (link.object_type === 'trace') {
                    navigate({ to: '/logs', search: { trace_id: link.object_id }, replace: true });
                    return;
                }
                if (link.object_type === 'log') {
                    navigate({ to: '/logs', search: { log_id: link.object_id }, replace: true });
                    return;
                }
                if (link.object_type === 'dataset') {
                    navigate({ to: '/datasets/$datasetId', params: { datasetId: link.object_id }, replace: true });
                    return;
                }
                if (link.object_type === 'experiment') {
                    navigate({ to: '/experiments/$experimentId', params: { experimentId: link.object_id }, replace: true });
                    return;
                }
                if (link.object_type === 'experiment_run') {
                    const run = await api.getExperimentRun(link.object_id);
                    const version = await api.getExperimentVersion(run.experiment_version_id);
                    navigate({
                        to: '/experiments/$experimentId',
                        params: { experimentId: version.experiment_id },
                        search: {
                            version: run.experiment_version_id,
                            run: run.id,
                            result: resultId || undefined,
                        },
                        replace: true,
                    });
                    return;
                }

                setError('Unknown share link type.');
            } catch (err: unknown) {
                if (!canceled) setError(getErrorMessage(err, 'Failed to resolve share link.'));
            } finally {
                if (!canceled) setLoading(false);
            }
        };

        resolve();
        return () => {
            canceled = true;
        };
    }, [token, projects, onProjectResolved, navigate, search]);

    return (
        <div className="flex items-center justify-center h-full bg-app text-text-main">
            <Card className="max-w-md w-full mx-4 p-6 text-center shadow-lg animate-soft-in">
                <div className="text-xs uppercase tracking-widest text-text-muted font-bold mb-2">Share Link</div>
                {loading ? (
                    <p className="text-text-muted">Resolving share link...</p>
                ) : error ? (
                    <p className="text-rose-500 text-sm">{error}</p>
                ) : (
                    <p className="text-text-muted">Resolving share link...</p>
                )}
            </Card>
        </div>
    );
};
