import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { Trace } from '../../types';

export interface TraceLineageState {
    parentTrace: Trace | null;
    parentTraceLoading: boolean;
    parentTraceError: string | null;
    siblingTraces: Trace[];
    childTraces: Trace[];
    siblingLoading: boolean;
    childLoading: boolean;
    siblingError: string | null;
    childError: string | null;
}

export function useTraceLineage(trace: Pick<Trace, 'id' | 'project_id' | 'parent_trace_id'>): TraceLineageState {
    const [parentTrace, setParentTrace] = useState<Trace | null>(null);
    const [parentTraceLoading, setParentTraceLoading] = useState(false);
    const [parentTraceError, setParentTraceError] = useState<string | null>(null);
    const [siblingTraces, setSiblingTraces] = useState<Trace[]>([]);
    const [childTraces, setChildTraces] = useState<Trace[]>([]);
    const [siblingLoading, setSiblingLoading] = useState(false);
    const [childLoading, setChildLoading] = useState(false);
    const [siblingError, setSiblingError] = useState<string | null>(null);
    const [childError, setChildError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        const parentId = trace.parent_trace_id;
        if (!parentId) {
            setParentTrace(null);
            setParentTraceError(null);
            setParentTraceLoading(false);
            return () => {
                active = false;
            };
        }

        setParentTraceLoading(true);
        setParentTraceError(null);
        setParentTrace(null);

        api.getTraces(trace.project_id, { search: parentId, limit: 1 })
            .then((items) => {
                if (!active) return;
                const match = items.find((item) => item.id === parentId) || null;
                setParentTrace(match);
                if (!match) {
                    setParentTraceError('Parent trace not found in this project.');
                }
            })
            .catch(() => {
                if (!active) return;
                setParentTrace(null);
                setParentTraceError('Unable to load parent trace details.');
            })
            .finally(() => {
                if (!active) return;
                setParentTraceLoading(false);
            });

        return () => {
            active = false;
        };
    }, [trace.parent_trace_id, trace.project_id]);

    useEffect(() => {
        let active = true;
        const parentId = trace.parent_trace_id;
        if (!parentId) {
            setSiblingTraces([]);
            setSiblingError(null);
            setSiblingLoading(false);
            return () => {
                active = false;
            };
        }

        setSiblingLoading(true);
        setSiblingError(null);

        api.getTraces(trace.project_id, { parent_trace_id: parentId, limit: 8 })
            .then((items) => {
                if (!active) return;
                setSiblingTraces(items.filter((item) => item.id !== trace.id));
            })
            .catch(() => {
                if (!active) return;
                setSiblingError('Unable to load sibling traces.');
                setSiblingTraces([]);
            })
            .finally(() => {
                if (!active) return;
                setSiblingLoading(false);
            });

        return () => {
            active = false;
        };
    }, [trace.parent_trace_id, trace.project_id, trace.id]);

    useEffect(() => {
        let active = true;
        setChildLoading(true);
        setChildError(null);

        api.getTraces(trace.project_id, { parent_trace_id: trace.id, limit: 8 })
            .then((items) => {
                if (!active) return;
                setChildTraces(items);
            })
            .catch(() => {
                if (!active) return;
                setChildError('Unable to load child traces.');
                setChildTraces([]);
            })
            .finally(() => {
                if (!active) return;
                setChildLoading(false);
            });

        return () => {
            active = false;
        };
    }, [trace.id, trace.project_id]);

    return {
        parentTrace,
        parentTraceLoading,
        parentTraceError,
        siblingTraces,
        childTraces,
        siblingLoading,
        childLoading,
        siblingError,
        childError,
    };
}
