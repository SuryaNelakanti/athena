import { API_BASE_URL, requestJson } from './base';
import type {
    AutomationRule,
    AutomationRuleCreateInput,
    AutomationRun,
    DeleteResult,
    Experiment,
    Guardrail,
    GuardrailCreateInput,
    GuardrailUpdateInput,
    PlaygroundPromoteInput,
    PlaygroundRunInput,
    PlaygroundRunResponse,
    RemoteEval,
    RemoteEvalInvokeInput,
    RemoteEvalInvokeResult,
    RemoteEvalRegisterInput,
    ReplayRunResult,
    RunCompareResult,
    SpanFeedback,
    SpanFeedbackCreateInput,
    SpanScore,
    SpanScoreCreateInput,
} from '../../types';

export const operationsApi = {
    // Guardrails
    getGuardrails: async (projectId: string): Promise<Guardrail[]> => {
        return requestJson<Guardrail[]>(`${API_BASE_URL}/guardrails/?project_id=${projectId}`, 'Failed to fetch guardrails');
    },

    createGuardrail: async (guardrail: GuardrailCreateInput): Promise<Guardrail> => {
        return requestJson<Guardrail>(`${API_BASE_URL}/guardrails/`, 'Failed to create guardrail', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(guardrail),
        });
    },

    updateGuardrail: async (guardrailId: string, updates: GuardrailUpdateInput): Promise<Guardrail> => {
        const params = new URLSearchParams();
        if (updates.enabled !== undefined) params.append('enabled', String(updates.enabled));
        if (updates.action) params.append('action', updates.action);

        return requestJson<Guardrail>(
            `${API_BASE_URL}/guardrails/${guardrailId}?${params.toString()}`,
            'Failed to update guardrail',
            { method: 'PATCH' }
        );
    },

    deleteGuardrail: async (guardrailId: string): Promise<DeleteResult> => {
        return requestJson<DeleteResult>(`${API_BASE_URL}/guardrails/${guardrailId}`, 'Failed to delete guardrail', {
            method: 'DELETE',
        });
    },

    createGuardrailFromAntiPattern: async (
        projectId: string,
        patternId: string,
        name: string,
        action: string = "warn"
    ): Promise<Guardrail> => {
        const params = new URLSearchParams({
            project_id: projectId,
            pattern_id: patternId,
            name,
            action,
        });
        return requestJson<Guardrail>(
            `${API_BASE_URL}/guardrails/from-anti-pattern?${params.toString()}`,
            'Failed to create guardrail from anti-pattern',
            { method: 'POST' }
        );
    },

    createSpanFeedback: async (spanId: string, payload: SpanFeedbackCreateInput): Promise<SpanFeedback> => {
        return requestJson<SpanFeedback>(`${API_BASE_URL}/v1/spans/${spanId}/feedback`, 'Failed to create span feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    },

    upsertSpanScore: async (spanId: string, payload: SpanScoreCreateInput): Promise<SpanScore> => {
        return requestJson<SpanScore>(`${API_BASE_URL}/v1/spans/${spanId}/scores`, 'Failed to upsert span score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    },

    createAutomationRule: async (payload: AutomationRuleCreateInput): Promise<AutomationRule> => {
        return requestJson<AutomationRule>(`${API_BASE_URL}/automations/rules`, 'Failed to create automation rule', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    },

    listAutomationRuns: async (projectId: string, ruleId?: string): Promise<AutomationRun[]> => {
        const params = new URLSearchParams({ project_id: projectId });
        if (ruleId) params.append('rule_id', ruleId);
        return requestJson<AutomationRun[]>(`${API_BASE_URL}/automations/runs?${params.toString()}`, 'Failed to list automation runs');
    },

    replayRun: async (runId: string): Promise<ReplayRunResult> => {
        return requestJson<ReplayRunResult>(`${API_BASE_URL}/runs/${runId}/replay`, 'Failed to replay run', { method: 'POST' });
    },

    compareRuns: async (runId: string, otherRunId: string): Promise<RunCompareResult> => {
        return requestJson<RunCompareResult>(`${API_BASE_URL}/runs/${runId}/compare/${otherRunId}`, 'Failed to compare runs');
    },

    runPlayground: async (playgroundId: string, payload: PlaygroundRunInput): Promise<PlaygroundRunResponse> => {
        return requestJson<PlaygroundRunResponse>(`${API_BASE_URL}/playgrounds/${playgroundId}/run`, 'Failed to run playground', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    },

    promotePlayground: async (playgroundId: string, payload: PlaygroundPromoteInput): Promise<Experiment> => {
        return requestJson<Experiment>(`${API_BASE_URL}/playgrounds/${playgroundId}/promote`, 'Failed to promote playground', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    },

    registerRemoteEval: async (payload: RemoteEvalRegisterInput): Promise<RemoteEval> => {
        return requestJson<RemoteEval>(`${API_BASE_URL}/remote-evals/register`, 'Failed to register remote eval', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    },

    invokeRemoteEval: async (remoteEvalId: string, payload: RemoteEvalInvokeInput): Promise<RemoteEvalInvokeResult> => {
        return requestJson<RemoteEvalInvokeResult>(`${API_BASE_URL}/remote-evals/${remoteEvalId}/invoke`, 'Failed to invoke remote eval', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    },
};
