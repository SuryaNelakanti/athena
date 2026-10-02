# Athena - Current Status (2026-09-27)

This file summarizes what is implemented in the current repo vs. the intended direction in `docs/project-context.md`, and proposes an action plan for the agent-native wedge (session-first runs + graph debugging + trajectory-aware eval + closed-loop automation).

---

## What exists today (repo reality)

### Frontend (Athena app)
- Hash-based router with primary pages: Dashboard, Agent Runs, Logs (with Trace detail), Review, Collaboration, Datasets, Experiments, Playgrounds, Settings (`frontend/src/App.tsx`, `frontend/src/design/layout/Layout.tsx`).
- OwlWidget is mounted globally and appears on every screen (`frontend/src/App.tsx`, `frontend/src/design/components/OwlWidget.tsx`).
- Onboarding flow supports organization + project creation in the welcome screen (`frontend/src/App.tsx`).
- Frontend API clients share JSON/void response handling and use typed contracts for datasets, functions, collaboration records, and review items (`frontend/src/lib/api/`).
- Experiment runs, comparisons, provider credentials, and model registry calls also use domain request/response types; experiment comparison state and rows are typed in the detail page (`frontend/src/lib/api/experiments.ts`, `frontend/src/pages/ExperimentDetail.tsx`).
- Operations, observability, and saved-view API contracts now use domain types as well, including guardrails, span scores/feedback, automations, replays, playground runs, remote evals, log ingestion, and documentation search (`frontend/src/lib/api/operations.ts`, `frontend/src/lib/api/observability.ts`, `frontend/src/lib/api/view.ts`).
- Experiment comparison summary cards, scorer deltas, and filtered row diffs live in a dedicated typed component (`frontend/src/features/experiments/ExperimentComparisonPanel.tsx`).
- Experiment version creation and share link dialogs now use focused controlled components with typed props (`frontend/src/features/experiments/ExperimentVersionForm.tsx`, `frontend/src/features/experiments/ExperimentShareModal.tsx`).
- Async page actions use a shared error-to-message helper and catch `unknown` values, including a typed abort check for canceled playground runs (`frontend/src/lib/errors.ts`).
- Experiment version config and main-version summaries follow explicit frontend contracts matching the backend; Owl and experiment list consumers now use typed experiment and dataset objects (`frontend/src/types.ts`, `frontend/src/pages/ExperimentDetail.tsx`).
- TanStack route typing now runs with `strictNullChecks`; page navigation and route search updates use inferred contracts, and external search parameters are narrowed before use (`frontend/src/router.tsx`, `frontend/tsconfig.json`).
- AQL result fields are treated as `unknown`; Logs parses only valid log rows and Dashboard narrows timestamp and metric values before chart aggregation (`frontend/src/types.ts`, `frontend/src/features/logs/logParsing.ts`, `frontend/src/features/dashboard/metrics.ts`).
- Logs now renders the table header, loading/empty states, row metrics, and trace-lineage badges through a typed results component, keeping those display details out of the page controller (`frontend/src/pages/LogTable.tsx`, `frontend/src/features/logs/LogResultsTable.tsx`).
- TraceDetail renders parent, sibling, current, and child trace context through a typed lineage panel, keeping relationship display and preview calculations separate from trace loading and selection (`frontend/src/pages/TraceDetail.tsx`, `frontend/src/features/traces/TraceLineagePanel.tsx`).
- Dashboard chart config uses unknown-safe parsing, removes the API-only `project_id` field structurally when updating, and accepts saved guided settings only when their values match supported options (`frontend/src/features/dashboard/aql.ts`, `frontend/src/pages/Dashboard.tsx`).
- Dataset, prompt-test, and experiment result payload fields use `unknown`; shared structured-data extractors serve Dataset, Prompt Test, and Experiment screens (`frontend/src/types.ts`, `frontend/src/lib/structuredData.ts`).
- SessionDetail timeline and annotation loading now live in a selection-aware hook; stale responses are ignored, and load/save failures are shown in context; share-link creation and copy use the shared collaboration hook and dialog. The page composes separate stats, context-card, run-list, timeline, and annotation components; annotation creation state and its session guard live with the annotation panel (`frontend/src/features/sessions/useSessionDetailData.ts`, `frontend/src/features/sessions/SessionOverview.tsx`, `frontend/src/features/sessions/SessionContextCards.tsx`, `frontend/src/features/sessions/SessionRunsPanel.tsx`, `frontend/src/features/sessions/SessionTimelinePanel.tsx`, `frontend/src/features/sessions/SessionAnnotationsPanel.tsx`, `frontend/src/features/collaboration/useShareLink.ts`, `frontend/src/features/collaboration/ShareLinkModal.tsx`, `frontend/src/pages/SessionDetail.tsx`).
- Session-list loading, stale project/filter request guards, search filtering, and summary counts now live in `useSessionListData`; controls and loading/error/empty/card rendering are separate components. The route page is now 49 lines (`frontend/src/features/sessions/useSessionListData.ts`, `frontend/src/features/sessions/SessionListControls.tsx`, `frontend/src/features/sessions/SessionListResults.tsx`, `frontend/src/features/sessions/sessionListUtils.ts`, `frontend/src/pages/SessionList.tsx`).
- Logs and Agent Runs route detail loads now distinguish request failures from missing objects, ignore stale results, and no longer issue an unused selected-log lookup (`frontend/src/App.tsx`).
- PromptTestDetail now uses a focused polling hook that avoids overlapping polls, ignores results after route changes, and displays load errors instead of reporting a failed load as a missing test (`frontend/src/features/prompt-tests/usePromptTestDetailData.ts`, `frontend/src/pages/PromptTestDetail.tsx`).
- ReviewQueue ignores stale dataset and review responses after project or filter changes, clears scoped data when the project is absent, and resets note edits when selection changes. Selected review details and actions now live in a focused panel (`frontend/src/features/review/ReviewDetailPanel.tsx`, `frontend/src/pages/ReviewQueue.tsx`).
- DatasetDetail dataset, row, history, and revision loads now live in a selection-aware hook; stale results are ignored, each failed load has its own retryable error state, and share/copy actions use the shared target-scoped hook and dialog. Eval/resource rows and version history render through focused panels with shared row-kind and label helpers. Dataset row creation validation, API submission, reload, and reset live in `useDatasetRowCreation`; controlled form UI lives in `DatasetRowCreateModal`, reducing DatasetDetail from 386 to 261 lines (`frontend/src/features/datasets/useDatasetDetailData.ts`, `frontend/src/features/datasets/DatasetRowsPanel.tsx`, `frontend/src/features/datasets/DatasetHistoryPanel.tsx`, `frontend/src/features/datasets/useDatasetRowCreation.ts`, `frontend/src/features/datasets/DatasetRowCreateModal.tsx`, `frontend/src/features/collaboration/useShareLink.ts`, `frontend/src/features/collaboration/ShareLinkModal.tsx`, `frontend/src/pages/DatasetDetail.tsx`).
- DatasetList and FunctionsList now distinguish load failures from empty results, ignore stale project responses, and expose retry actions; function deletion errors are visible. PromptTestModal reports model/scorer option failures, and Owl and Run Narrative preserve optional-data errors instead of silently treating failed loads as empty. Owl playbook controls and action-specific inputs render in a controlled `OwlPlaybookPanel`; project-scoped experiment options load through stale-request-safe `useOwlExperiments`; chat/playbook requests, validation, messages, loading, and action errors live in `useOwlAssistant`. Run Narrative's run/graph/evaluation request lifecycle now lives in `useRunNarrativeData`, its evaluation configuration/summary render through `RunEvaluationPanels`, and the typed selected-node inspector owns tool, retrieval, reasoning, metrics, and causal-chain detail rendering (`frontend/src/pages/DatasetList.tsx`, `frontend/src/pages/FunctionsList.tsx`, `frontend/src/components/PromptTestModal.tsx`, `frontend/src/features/owl/OwlWidget.tsx`, `frontend/src/features/owl/OwlPlaybookPanel.tsx`, `frontend/src/features/owl/useOwlExperiments.ts`, `frontend/src/features/owl/useOwlAssistant.ts`, `frontend/src/features/run-narrative/RunNarrative.tsx`, `frontend/src/features/run-narrative/useRunNarrativeData.ts`, `frontend/src/features/run-narrative/RunEvaluationPanels.tsx`, `frontend/src/features/run-narrative/RunNodeInspector.tsx`).
- App startup and first-project creation now display actionable errors and retry workspace initialization through `useWorkspaceBootstrap`; onboarding form UI lives in `FirstProjectSetup`, and Logs/Runs route components have page modules (`frontend/src/features/workspace/useWorkspaceBootstrap.ts`, `frontend/src/features/workspace/FirstProjectSetup.tsx`, `frontend/src/pages/LogsRoute.tsx`, `frontend/src/pages/RunsRoute.tsx`). The app root is a 121-line project/layout/Owl composition. Playground model, dataset, and saved-workspace loading and refresh now live in the project-scoped `usePlaygroundWorkspace` hook, which clears old project data, ignores stale responses, and exposes retryable failures. Snapshot actions live in `usePlaygroundSnapshot`; run comparison state/diffing lives in `usePlaygroundComparison`; prompt/context editing lives in `usePlaygroundPrompt`; variant normalization and CRUD live in `usePlaygroundVariants`; create/update/delete requests live in `usePlaygroundPersistence`. The page reports clipboard errors (`frontend/src/App.tsx`, `frontend/src/features/playground/usePlaygroundWorkspace.ts`, `frontend/src/features/playground/usePlaygroundSnapshot.ts`, `frontend/src/features/playground/usePlaygroundComparison.ts`, `frontend/src/features/playground/usePlaygroundPrompt.ts`, `frontend/src/features/playground/usePlaygroundVariants.ts`, `frontend/src/features/playground/usePlaygroundPersistence.ts`, `frontend/src/pages/Labs.tsx`).
- Dashboard AQL preview requests/results/errors/loading now live in `useDashboardChartPreview`; responses are discarded after the project, mode, builder/query changes, or unmount, and stale preview rows clear when the input changes (`frontend/src/features/dashboard/useDashboardChartPreview.ts`).
- Playground editor rendering now lives in `PlaygroundWorkspaceView`; `Labs.tsx` keeps state/hook orchestration and passes typed workspace, prompt, variant, comparison, and trace props. The page dropped from 385 to 344 lines (`frontend/src/pages/Labs.tsx`, `frontend/src/features/playground/PlaygroundWorkspaceView.tsx`).
- Provider-key and model-registry loading, refresh, credential changes, model toggles, and bulk actions now live in `useProviderSettings`; stale loads are discarded after newer requests or unmount. `ProviderSettingsPanel` owns the provider/model UI, leaving the Settings page to compose that surface with appearance controls (`frontend/src/features/settings/useProviderSettings.ts`, `frontend/src/features/settings/ProviderSettingsPanel.tsx`, `frontend/src/pages/Settings.tsx`).
- Mutable list and mapping defaults in database models and API schemas now use per-instance factories, so separate requests and model instances do not share collection defaults (`backend/app/models.py`, `backend/app/schemas/sessions.py`, `backend/app/routers/`).
- Review schemas and queue CRUD are separated from trace-derived review creation and dataset promotion; all existing review endpoints remain composed under `/reviews` (`backend/app/schemas/reviews.py`, `backend/app/routers/review_catalog_routes.py`, `backend/app/routers/review_trace_routes.py`).
- Log API schemas, write/score-enqueue logic, and query/delete routes now live in focused modules composed under the unchanged `/logs` prefix; single and batch ingestion share normalization and record construction (`backend/app/schemas/logs.py`, `backend/app/services/log_ingestion.py`, `backend/app/routers/log_ingestion_routes.py`, `backend/app/routers/log_query_routes.py`).
- Prompt-test template/message formatting and execution now live in `prompt_test_input.py` and `prompt_test_executor.py`; `PromptTestRowExecutor` owns row calls, scoring, and result persistence while the existing service entry point remains (`backend/app/services/prompt_test_service.py`).
- Session ingest schemas live in `backend/app/schemas/session_ingest.py`; session/run metadata normalization and trace assembly live in `session_ingest_normalizer.py`; tool-call and retrieval/RAG span normalization live in `session_ingest_span_normalizer.py`; persistence orchestration lives in `session_ingest_service.py`. The `/ingest` route preserves its request/response contract and maps typed conflicts to HTTP errors.
- Session-evaluation creation now separates run selection, trace input loading, scorer dispatch, and versioned persistence into named service methods; `SessionEvalService.create_eval` retains its existing validation and output shape (`backend/app/services/session_eval_service.py`).
- Online scoring delegates low-score review-item creation and refresh to `OnlineScoringReviewService`; log score metadata, review item, and trace lookup remain in the same transaction (`backend/app/services/online_scoring_review.py`).
- Provider-key AES-GCM encoding and legacy ciphertext decoding now live in `ProviderKeyCipher`; `ProviderKeyStore.encrypt_key` and `decrypt_key` remain delegating compatibility methods, and durable/environment key resolution stays in the store (`backend/app/services/provider_key_cipher.py`).
- Experiment version model/task/scorer settings parse through `ExperimentRunConfig`; `ExperimentRunSummary` owns incremental score/usage/latency aggregation. `ExperimentRunExecutor.execute_run` now composes preparation, start, row iteration/processing, and finish helpers, dropping from 123 to 15 lines (`backend/app/services/experiment_run_config.py`, `backend/app/services/experiment_run_summary.py`).
- Persisted and API model declarations now live in 13 domain modules under `backend/app/db_models/`; `backend/app/models.py` remains the compatibility export and retains all current model names. Project, Trace, and Span ORM relationship declarations stay together in the observability module.
- Shared TypeScript contracts now live in focused domain modules behind the existing `frontend/src/types.ts` re-export, so current import paths remain compatible (`frontend/src/types/`).

### Testing
- Playwright MVP customer-flow coverage using mocked API fixtures (dashboard charts, logs->trace collaboration/share/review/promote, review->dataset, experiments run/compare/share, collaboration lists) (`frontend/tests/mvp.customer-flow.spec.ts`, `frontend/tests/fixtures/mockApi.ts`, `frontend/tests/fixtures/seedStoryData.ts`).

### Auth (current state)
- No end-user auth/RBAC yet; the backend seeds a default organization + project for local/dev flows, and the UI can create organizations/projects via onboarding (`backend/app/main.py`, `frontend/src/App.tsx`).

### OwlWidget (in-app assistant)
- Page-aware context (route + params + project) is sent to the backend for system prompt construction.
- Playbooks: AQL authoring, prompt optimization, scorer draft, dataset ideas, experiment summary, docs search.
- Uses server-managed Owl chat endpoint (`POST /owl/chat`), which auto-selects a model based on configured provider keys and returns `trace_id`/`span_id` for correlation.
- Owl chat maps typed upstream provider failures to HTTP 502 and returns a generic HTTP 500 detail for unexpected gateway failures (`backend/app/routers/owl.py`).
- Uses `POST /owl/search-docs` for lightweight docs search across repo markdown; `GET /owl/available-model` reports active provider/model.

### Proxy (unified inference)
- `POST /v1/chat/completions` supports streaming and returns trace context headers (`X-Athena-Trace-ID`, `X-Athena-Span-ID`), and accepts parent context (`X-Athena-Trace-ID`, `X-Athena-Parent-Span-ID`) (`backend/app/routers/proxy_completion_routes.py`).
- Athena Gateway headers now include org/project/cache semantics plus provider/cache/error response headers (`X-Athena-Org-ID`, `X-Athena-Project-ID`, `X-Athena-Parent`, `X-Athena-Use-Cache`, `X-Athena-Cache-TTL`, `X-Athena-Used-Provider`, `X-Athena-Cached`, `X-Athena-Error-Origin`) (`backend/app/routers/proxy_completion_routes.py`).
- Gateway span feedback and score APIs exist: `POST /v1/spans/{span_id}/feedback` and `POST /v1/spans/{span_id}/scores` (`backend/app/routers/proxy_span_feedback_routes.py`, `backend/app/models.py`).
- Provider keys can be stored durably per org/project scope instead of only in-memory (`backend/app/routers/providers.py`, `backend/app/services/provider_keys.py`, `backend/app/models.py`).
- Upstream provider failures use a typed safe error at the provider-call boundary; non-streaming requests return HTTP 502 with provider-origin headers, and unexpected gateway failures return a generic HTTP 500 detail (`backend/app/providers/base.py`, `backend/app/routers/proxy_completion_routes.py`). Stream failures persist the safe message and terminate the SSE response.
- Cache endpoints exist (`/v1/cache/*`) (`backend/app/routers/proxy_operation_routes.py`).

### Observability (logs + traces)
- Traces/spans: ingest single/batch (`POST /traces`, `POST /traces/batch`) and list by project (`GET /projects/{project_id}/traces`) (`backend/app/routers/traces.py`).
- Logs: ingest single/batch plus list/filtering (`backend/app/routers/logs.py`, `frontend/src/design/pages/LogTable.tsx`).
- Trace model already includes `trace_group_id` (useful as a future “session grouping” primitive) (`backend/app/models.py`).

### Agent-native telemetry (v0, backend)
- Ingest contract: `POST /ingest` accepts a versioned session payload and stores raw ingest payloads (`backend/app/routers/ingest.py`).
- Session/run APIs: `GET /sessions`, `GET /sessions/{id}`, `GET /runs/{id}` (`backend/app/routers/sessions.py`).
- Session timeline: `GET /sessions/{id}/timeline` (`backend/app/routers/sessions.py`).
- Session annotations: create/list/update endpoints with audit logging (`backend/app/routers/sessions.py`).
- Run graph endpoint: `GET /runs/{id}/graph` (nodes/edges + layout hints) (`backend/app/routers/sessions.py`).
- Replay and graph-diff APIs exist: `POST /runs/{id}/replay` creates a frozen-tool replay trace/run, and `GET /runs/{id}/compare/{other_run_id}` returns added/removed/changed nodes plus metric deltas (`backend/app/routers/sessions.py`, `backend/app/models.py`).
- Ingest normalizes tool/retrieval spans (schema validation + metadata extraction) and separates reasoning content into attributes (`backend/app/routers/ingest.py`).
- Session eval records with versioning and scorer outputs (`backend/app/models.py`, `backend/app/services/session_eval_service.py`, `backend/app/routers/sessions.py`). Trajectory scoring algorithms and telemetry text extraction now live in `session_eval_scorers.py`, while `SessionEvalService` retains run selection, scorer orchestration, aggregation, and persistence.
- Data models: `AgentSessionModel`, `AgentRunModel`, `AgentSessionEventModel`, `AgentSessionAnnotationModel`, `AgentSessionIngestModel` (`backend/app/models.py`).
- Session APIs include run summaries (run_count, error_count, last_status, last_run_id) for list views (`backend/app/routers/sessions.py`).
- Demo seed script includes agent runs (run groups), runs, timeline events, and annotations (`backend/scripts/seed_story.py`).
- Session/run metadata stored in DB `metadata` columns via `metadata_` model fields to avoid SQLModel reserved names (`backend/app/models.py`).

### Agent-native UX (frontend)
- Agent Runs list + run group detail views with runs, timeline, and annotations (`frontend/src/design/pages/SessionList.tsx`, `frontend/src/design/pages/SessionDetail.tsx`).
- Run detail view with graph renderer + node inspector (`frontend/src/design/pages/RunDetail.tsx`, `frontend/src/design/components/RunGraph.tsx`).
- Agent Runs surface labels and summaries (run counts, error counts, last status) to support triage (`frontend/src/design/pages/SessionList.tsx`, `frontend/src/design/pages/SessionDetail.tsx`).
- Run node detail panel surfaces tool-call summaries, retrieval docs, and reasoning content where available (`frontend/src/features/run-narrative/RunNarrative.tsx`).
- Run detail surfaces session eval summary, config (expected answer + LLM judge toggle), and highlights failing nodes in the graph (`frontend/src/features/run-narrative/RunNarrative.tsx`, `frontend/src/features/run-narrative/RunGraph.tsx`).

### Datasets, review, experiments, and query
- Datasets: CRUD + versioned dataset rows (`backend/app/routers/datasets.py`).
- Trace and run promotion endpoints now live in `backend/app/routers/dataset_promotions.py` and are composed through the existing datasets router without changing their paths or request/response contracts.
- Review queue: `review_item` model and API (`backend/app/models.py`, `backend/app/routers/reviews.py`).
- Experiments: experiments, versions, runs, results (`backend/app/routers/experiments.py`).
- `ScorerService` retains its public exact-match, contains, regex, LLM-judge, and dispatcher methods while delegating deterministic algorithms to `deterministic_scorers.py` and semantic evaluation to `LLMJudgeScorer`; scorer failures continue to return per-scorer error results (`backend/app/services/scorer_service.py`, `backend/app/services/deterministic_scorers.py`, `backend/app/services/llm_judge_scorer.py`).
- Experiment result rows can generate share permalinks (`frontend/src/pages/ExperimentDetail.tsx`).
- Experiment detail UI now centers the version → run → results workflow and respects pinned dataset versions for row context; experiment run polling uses the experiment run endpoint (`frontend/src/pages/ExperimentDetail.tsx`).
- AQL: query endpoint exists (`backend/app/routers/aql.py`) and Dashboard includes monitor charts (`backend/app/routers/charts.py`, `frontend/src/design/pages/Dashboard.tsx`).
- Playground API now supports `POST /playgrounds/{id}/run` and `POST /playgrounds/{id}/promote` to preserve prompt/model iteration and promote a playground state into an experiment (`backend/app/routers/playgrounds.py`).
- Function assets now support versioning and metadata-only invocation (`POST /functions/{id}/versions`, `POST /functions/{id}/invoke`), which establishes the prompt/tool/scorer/workflow asset surface before sandboxed execution (`backend/app/routers/functions.py`, `backend/app/models.py`).
- Remote eval registration and invocation APIs exist for custom agent code before full sandboxing (`POST /remote-evals/register`, `POST /remote-evals/{id}/invoke`) (`backend/app/routers/remote_evals.py`, `backend/app/models.py`).

### Automations
- Automation rules and run logs exist (`POST /automations/rules`, `GET /automations/rules`, `GET /automations/runs`) with v1 triggers for run status, eval score, cost, and latency, and actions for review item creation, dataset queue suggestions, annotations, tags, and webhook queuing (`backend/app/routers/automations.py`, `backend/app/services/automation_service.py`, `backend/app/models.py`).
- Failed automation actions are logged with the rule and exception type; persisted run results now use a safe generic error instead of storing raw exception text (`backend/app/services/automation_service.py`).
- Rules are evaluated on session ingest and session eval creation, so failed/high-cost/high-latency runs and low eval scores can enter the review loop without a separate scheduler (`backend/app/routers/ingest.py`, `backend/app/routers/sessions.py`).

### Collaboration primitives (API-level)
- Attachments, assignments, mentions, share links, views, environments routers exist (`backend/app/routers/*`).
- Logs and traces generate share permalinks, resolved via the `/share-links` route (`frontend/src/design/pages/LogTable.tsx`, `frontend/src/design/pages/TraceDetail.tsx`, `frontend/src/App.tsx`).

### MCP server
- MCP router exists in backend and local setup docs are present, including smoke test steps (`backend/app/routers/mcp.py`, `docs/mcp.md`, `docs/mcp-ide-setup.md`).

---

### Proxy-to-Logs production telemetry
- Proxy responses now expose stable log correlation alongside trace/span context in JSON, SSE chunks, and browser-readable `X-Athena-*` headers.
- Streaming OpenAI calls request and normalize the provider's final usage chunk, then persist token and estimated-cost metrics on the log, span, and trace.
- Stream reasoning is retained separately from visible content, and successful non-streaming responses are cached independently of best-effort scoring job creation.

## What is missing (agent-native wedge gaps)

These are the biggest deltas between the additive wedge plan and the current codebase:

- OwlWidget context is sent as route params but still lacks session/run summaries or graph context.
- Auth/RBAC remains local-dev oriented; durable provider keys and service-token primitives exist, but full end-user authorization enforcement is not complete.
- Automation is API-first; the dedicated frontend rule builder/failure inbox still needs product UI polish and auto-curation clustering.
- Replay + diff is API-first; deterministic re-execution against live agent code and frontend graph-diff UX remain pending.

---

## Action plan: Agent-native wedge (additive, codebase-specific)

Goal: make Athena the best place to debug and improve agent runs by shipping (1) session-first telemetry, (2) a graph UI that makes runs legible fast, (3) trajectory-aware evaluation, and (4) automations that turn failures into review + datasets + experiments.

### Phase A0.2 - Telemetry ingestion contract freeze (v0)
1) Define `SessionIngestRequest v0` (versioned) with:
   - session metadata (id, project_id, agent_name, env, started_at, tags)
   - runs (run_id, trace_id, status, timings)
   - span tree + tool calls + optional retrieval events
   - optional “messages/events” for timeline materialization
2) Add `POST /ingest` (new router) that:
   - validates the schema version
   - writes raw ingest payloads for round-trip safety
   - maps “run -> trace/spans” into existing Trace/Span tables (so existing UI works immediately)
3) Acceptance:
   - `POST /ingest` accepts a session payload with nested spans + tool calls
   - API -> DB -> API round-trip without loss for v0 payload
   - schema version recorded per event/payload

### Phase A1 - Session-first objects + timeline
1) Data model:
   - `SessionModel` (project_id, agent_name, env, created/updated, status, tags)
   - `AgentRunModel` (session_id, trace_id, status, metrics rollups)
   - `SessionEventModel` (ordered event stream; stable pagination keys)
   - `SessionAnnotationModel` (labels/notes/severity/owner/status; audit log)
2) APIs:
   - `GET /sessions` (filter by project_id, time, env, agent_name)
   - `GET /sessions/{id}` (summary + latest run)
   - `GET /runs/{id}` (run detail with linked trace)
   - `GET /sessions/{id}/timeline` (ordered events; deterministic pagination)
3) UI:
   - Add “Agent Runs” list page and a “Run” detail view (link to existing Trace detail while graph UI is pending).
   - Add session/run summaries to OwlWidget context (route params already included).
4) Acceptance:
   - run groups (sessions) group multiple runs; run links to a trace/spans tree
   - timeline ordering rules documented and stable across pagination
   - annotations show in UI and write to audit log

### Phase A2 - Graph debugging UI (the “aha” moment)
1) Backend:
   - `GET /runs/{id}/graph` derived from spans (+ retries/branches) with layout hints
2) Frontend:
   - Graph renderer with node panels (inputs/outputs/metadata/errors)
   - Branch/retry visualization + “why breadcrumbs” (causal chain)
3) Acceptance:
   - node types include `llm_call`, `tool_call`, `retrieval`, `guardrail`, `retry`
   - runs with retries are visually comprehensible in <10 seconds

### Phase A3 - Tooling + RAG deep instrumentation
1) Enforce tool-call schema capture: tool_name, args, result, status, duration_ms; validation errors visible.
2) Add retrieval event type: query, top_k docs, scores, doc ids, citations; link docs via attachments/external URLs.
3) Ensure reasoning/content separation end-to-end (storage + API + UI).

### Phase A4 - Trajectory-aware evaluation
1) Add `session_eval` records (versioned): rubric + scores + summary.
2) Implement scorers:
   - Tool Correctness v1 (selection/args/sequence constraints) with failing node highlights
   - Path Efficiency v1 (loops/redundant calls/excess retries) with linked nodes
   - Outcome/Decision v1 (task-dependent; deterministic when expected provided)
   - LLM judge scorer (auditable: prompt template + model + token/cost stored)

### Phase A5 - Closed-loop automation
1) Rules engine v1: triggers -> actions, evaluated on ingest + session eval.
2) Failure queue (“Review Inbox”) generated by rules, with resolve/reassign/promote flows.
3) Auto-curation v1: dedup + clustering + sampling; “Suggested Dataset” view; approve to add dataset rows with provenance.

### Phase A6 - Replay + compare
1) API replay harness exists for frozen-tool replay traces linked to the original run.
2) API run-vs-run graph diff exists for nodes added/removed/changed and cost/latency/token deltas.
3) Remaining: live agent re-execution, frozen external tool-result capture, and frontend graph-diff visualization.

---

## Recommended “next commit”

Start with Phase A5:
- Add rules engine (triggers/actions) and a failure inbox that can promote sessions to review/datasets.
- Implement auto-curation to dedup and cluster failures.

That leverages the eval signals now present in sessions.

Current next commit target:
- Add frontend surfaces for automation rules, failure inbox filtering, replay/diff visualization, and gateway feedback/scores.
- Harden auth/RBAC enforcement around provider keys, service tokens, projects, and MCP tools.

## Clean Code migration (in progress, 2026-09-26)

The frontend API facade has been split into domain modules, and page logic has
been extracted from Labs, Dashboard, LogTable, TraceDetail, and
ExperimentDetail. Experiment version configuration and share link dialogs now
use typed feature components while the page retains draft state and API actions.
Playground run comparison rendering and config
decoding/serialization now live in focused feature modules with typed payloads.
All frontend API domain modules now use shared JSON or void response helpers;
dataset endpoints use domain request and response types. Remaining API work is
to replace loose payload and response types with domain contracts.
Dashboard statistics and chart transformations now use typed pure functions in
the dashboard feature module. Custom monitor chart cards and their shared
chart rendering now live in `frontend/src/features/dashboard/MonitorChartGrid.tsx`,
leaving the Dashboard page to manage chart queries, editing, and persistence.
Guided and AQL chart configuration plus preview rendering now live in
`GuidedChartFields`, `AqlChartFields`, and `DashboardChartPreview`;
`DashboardChartBuilder` composes them with chart identity/type and save/cancel
controls. The builder dropped from 343 to 124 lines (`frontend/src/features/dashboard/`).
Dashboard owns query, preview, save, and refresh actions.
Playground SSE deltas are narrowed from `unknown` before content and reasoning
are appended, replacing an unchecked stream choice cast in Labs.
Playground request transport and SSE buffering now live in
`frontend/src/features/playground/stream.ts`; Labs owns run state transitions
and supplies an update callback.
Shared frontend entity payloads now use `unknown` for dynamic values instead of
`any`; trace formatting, review fixture inputs, and run narrative tool/retrieval
details narrow those values before reading or rendering them.
The backend AQL shapes, parser, and executor are separate;
dataset revision persistence and experiment run summaries have shared helpers.
Literal parsing and formatting, including quote-aware list/conjunction splitting,
now live in `backend/app/services/aql_values.py`; `AQLParseError` is shared from
`backend/app/services/aql_errors.py` and remains imported through the parser for
compatibility. Python module compilation and whitespace checks passed. No tests
were run; E2E remains reserved for the end of the migration.
Experiment version creation and run endpoints now live in
`backend/app/routers/experiment_version_routes.py`, composed by the existing
experiments router; static route inspection retains all 16 method/path/handler
entries. `experiments.py` dropped from 379 to 186 lines, and all 107 backend
modules compile in memory. No tests were run; E2E remains reserved for the end
of the migration.
Saved-playground selection, loading, dirty-state signatures, and reset behavior
now live in `usePlaygroundSelection`; snapshot creation takes its current
playground name as an explicit action input. Prompt and variant callbacks are
stable across renders, and Labs is now 367 lines. TypeScript
checking, the Vite production build, and whitespace checks passed. No tests were
run; E2E remains reserved for the end of the migration.
`LogFilterToolbar` now composes separate saved-view, filter-editor, and active
filter components while retaining its query state and error reporting. The
toolbar dropped from 440 to 225 lines. TypeScript checking, the Vite production
build, and whitespace checks passed. No tests were run; E2E remains reserved
for the end of the migration.
Functions are now coordinated through `useFunctionCatalog`, with a controlled
`FunctionCreateModal` and shared cards/sections in `FunctionCatalog`.
`FunctionsList` dropped from 418 to 111 lines; type checking, production build,
and whitespace checks passed. No tests were run; E2E remains reserved for the
end of the migration.
`LogsRoute` and `RunsRoute` now live outside the app shell, and project/org
loading, retry, and first-project creation live in `useWorkspaceBootstrap` with
the onboarding form in `FirstProjectSetup`. `App.tsx` dropped from 401 to 121
lines. TypeScript checking, production build, and whitespace checks passed. No
tests were run; E2E remains reserved for the end of the migration.
Run Narrative's run/graph/evaluation loads, retry, eval request, score filtering,
and failing-node extraction now live in `useRunNarrativeData`; the evaluation
configuration and summary are rendered by `RunEvaluationPanels`. The route
composition dropped from 426 to 255 lines. TypeScript checking, production
build, and whitespace checks passed. No tests were run; E2E remains reserved
for the end of the migration.
The Python and TypeScript SDKs now share request construction logic within each
client. Existing seeded E2E fixture merge markers were resolved.
Frontend routes now load pages on demand; the initial production JavaScript
chunk fell from about 992 KB to 475 KB. The Vite config now resolves its path
as an ES module, and the production build passes with the `runner` loader.
Session response schemas and run graph assembly now live in separate schema and
service modules. Experiment comparison output assembly is separated from its
router. TypeScript SDK HTTP responses with non-retryable errors now exit without
being retried as transport failures.
Both SDKs expose an `AthenaClientError` with an HTTP `status` field, and the
TypeScript fallback path now observes configured timeouts and typed response
errors. Both clients reject negative or non-finite retry timing values and
invalid retry counts during construction.
Frontend type checking now rejects unused locals and parameters. The Run detail
header links to its trace when one is available, and Prompt Test errors are
visible in the page. Three empty E2E placeholder specs were removed.
Background score-enqueue and worker failures are no longer silently discarded;
expected output parsing now checks nested payload shapes before reading them.
Proxy failures from streamed and non-streamed calls share one error persistence
path, and model-list errors use structured logging instead of standard output.
Trace/log commits, trace aggregate updates, failed-call records, and score-job
enqueueing now live in `backend/app/services/proxy_persistence.py`, separating
that persistence lifecycle from provider and cache orchestration.
Trace and span context resolution and creation now live in
`backend/app/services/proxy_trace_service.py`; both tracing and persistence use
the shared call data contract in `backend/app/services/proxy_context.py`.
Direct and cache-hit proxy responses now share completion accounting, span
metrics, log creation, persistence, and scoring enqueue through one helper in
`backend/app/services/proxy_service.py`.
Streamed completion bookkeeping and its canonical log now live in a separate
helper outside the event iterator, which only aggregates and emits chunks.
Experiment version and run management now delegate run execution, dataset input
formatting, row result persistence, and run summary updates to
`backend/app/services/experiment_run_executor.py`; the existing service entry
point remains available for the job worker.
Database lookup and similarity matching for the anti-pattern scorer now live in
`backend/app/services/anti_pattern_scorer.py`, with scorer result data shared
through `backend/app/services/scorer_result.py`.
Session list, detail, and run response shaping now lives in
`backend/app/services/session_query_service.py`. Session-evaluation automation
runs after eval creation; annotation creation no longer touches eval-only state.
The Labs page now composes focused workspace, run-board, and experiment-snapshot
sidebar cards from `PlaygroundWorkspaceCard`, `PlaygroundRunBoardCard`, and
`PlaygroundSnapshotCard`, collected by
`frontend/src/features/playground/PlaygroundSidebar.tsx`, plus
the prompt and context editor from
`frontend/src/features/playground/PlaygroundPromptCard.tsx`, and variant
configuration/output cards from
`frontend/src/features/playground/PlaygroundVariantGrid.tsx`; the page retains
state and persistence handlers.
Streaming run state, per-variant run history, cancellation controllers, and
batch execution now live in `frontend/src/features/playground/usePlaygroundRuns.ts`.
The sidebar's typed state contracts now live in
`frontend/src/features/playground/PlaygroundSidebarState.ts`; its composition
module dropped from 314 to 17 lines.
Trace caching/loading and the trace modal presentation now live in focused
playground feature modules; the Labs page composes the modal with TraceDetail.
ExperimentDetail now composes an `ExperimentResultsPanel` for result filtering,
summary metrics, and expanded row details, while the page retains URL state and
data orchestration.
Expected-text extraction now uses one explicit-shape helper for scorers, and
experiment dataset inputs are treated as objects at the parsing boundary.
Frozen run replay persistence now lives in a service module, leaving the session
router to validate the source objects and build the API response.
Stored experiment model, task, and scorer configuration is narrowed at the run
executor boundary, and a temperature of zero is retained from version creation
through model execution.
Experiment input-to-message conversion is shared between both experiment run
services while Prompt Test retains its variable interpolation behavior.
LLM judge prompt construction and response parsing are separated from request
orchestration; per-scorer request failures remain attached to the score result
and now produce a structured warning.
Prompt Test model and run failures now use structured logging while their
per-row and run-level error records are preserved.
Owl and MCP documentation search now use one typed service to scan repository
Markdown files.
Startup seed events and provider key/model-list warnings now use logging instead
of stdout; known-model fallback lists remain unchanged.
Experiment, review, and trace-related dataset loading errors now appear in the
relevant UI instead of only going to the console.
TypeScript proxy and fallback text requests share retry and timeout handling,
and primary/fallback SSE requests share one transport loop. Python text paths
share a retrying opener, and primary/fallback SSE paths share one retry loop.
Retryable proxy failures and malformed successful TypeScript proxy responses
still use the configured fail-open provider; non-retryable HTTP statuses remain
terminal. SDK verification passed: TypeScript strict compilation and Python
`compileall`.
The migration plan and remaining areas are tracked in
`docs/clean-code-migration.md`. No unit tests were added or run; E2E flow
testing is reserved for the end of the migration.

MCP routing is split by responsibility: OAuth/PKCE endpoints are in
`backend/app/routers/mcp_oauth.py`; documentation, object/permalink, AQL/schema,
and experiment-summary tools live in focused routers composed by
`backend/app/routers/mcp_tools.py`; and `backend/app/routers/mcp.py` composes
both top-level routers under the existing `/mcp` prefix. A static inventory
matched all eight tool routes and 117 backend modules compiled in memory. Runtime
route import verification could not run because the configured Python runtime
does not have FastAPI installed. No tests were run.

TraceDetail now delegates span tree ordering and display to
frontend/src/features/traces/TraceSpanWorkspace.tsx, trace lineage requests to
frontend/src/features/traces/useTraceLineage.ts, and its promotion and
collaboration dialogs to focused feature components. Reasoning data is narrowed
to strings before rendering. Frontend TypeScript checking and the Vite
production build passed after these changes. No tests were run; E2E remains
reserved for the end of the migration.

LogTable is a 68-line page composition. `useLogTableData` owns log queries,
selected-log loading, trace-lineage loading, and stale-response cancellation;
`useSavedLogViews` owns saved-view loading and mutations with project-change
cancellation. Filter and saved-view controls live in `LogFilterToolbar`. The
unreachable collaboration dialog was removed, and selected-log, saved-view, and
lineage errors are visible. Frontend TypeScript checking and the Vite production
build passed. No tests were run; E2E remains reserved for the end of the
migration.

Dashboard now composes data loading from
frontend/src/features/dashboard/useDashboardData.ts and chart authoring from
frontend/src/features/dashboard/useDashboardChartBuilder.ts. The named log
query and visible load errors are in place; stale chart-data requests cannot
replace newer results. ExperimentDetail delegates its version, config, and run
sidebar to frontend/src/features/experiments/ExperimentOverviewSidebar.tsx.
Baseline/candidate and dataset-row load errors are visible, share-copy errors
are handled, scorer configs are narrowed without casts, and zero temperature is
preserved. Frontend TypeScript checking and the Vite production build passed.
No tests were run; E2E remains reserved for the end of the migration.

Proxy response cache request normalization, AES key handling, cached-response
validation, and payload serialization now live in
`backend/app/services/proxy_response_cache.py`. Explicit cache TTL values now
reach cache storage; they were previously recorded on the span but not applied
to cache entries. Python syntax compilation passed. No tests were run.

Proxy stream orchestration now lives in
`backend/app/services/proxy_streaming.py`: it owns trace setup, SSE encoding,
content/reasoning aggregation, and final success/failure persistence. The
public service return tuple and SSE frame format are preserved; fragments are
joined once for the final snapshot. Python syntax compilation passed. No tests
were run.

Session APIs now compose focused annotation, evaluation, and run routers through
the existing `sessions.router`; session reads remain in the facade. Run graph,
replay, and comparison endpoints are grouped in `session_runs.py`, and run
comparison assembly lives in `run_comparison_service.py`. A static comparison
confirmed all 13 method/path signatures are preserved. Backend syntax
compilation passed; runtime router import could not run because the bundled
Python runtime lacks FastAPI. No tests were run.

Session timeline existence checks and ordered, paginated event queries now live
in `SessionQueryService`; the route still returns the same 404 for missing
sessions and preserves its response ordering and pagination defaults. Python
syntax compilation and whitespace checks passed. No tests were run.

Four experiment operations now share a handler for unexpected failures. The
server logs the operation and exception class, and clients receive a safe
operation-specific HTTP 500 detail instead of raw exception text. Existing
`ValueError` mappings remain unchanged. Python syntax compilation and
whitespace checks passed. No tests were run.

The Python SDK now matches TypeScript fail-open behavior when a successful
proxy response contains invalid JSON or a non-object body. TypeScript's SSE
decoder flushes its UTF-8 decoder and parses a final unterminated `data:` line;
Python replaces invalid UTF-8 bytes to match browser decoder behavior. SDK
documentation now describes the fail-open conditions. TypeScript SDK type
checking and Python SDK syntax compilation passed. No tests were run.

ExperimentDetail now delegates experiment, version, run, result, and pinned
dataset-row loading to `useExperimentDetailData`, which discards responses that
no longer match the active selection. Baseline/candidate run loading, comparison
execution, and comparison rendering live in `ExperimentComparisonWorkspace`;
stale comparison results are discarded, and selections persist when the tab is
hidden. The page is now 441 lines. Frontend TypeScript checking and the Vite
production build passed. No tests were run; E2E remains reserved for the end of
the migration.

Athena proxy streams in the Python and TypeScript SDKs now require the terminal
`[DONE]` marker. Incomplete responses retry and can fail open before yielding
chunks; after yielding chunks, they surface as client errors. Fallback-provider
streams retain permissive EOF handling. Static Python compilation, TypeScript
checking, and whitespace checks passed. No tests were run; E2E remains reserved
for the end of the migration.

Experiment version draft defaults, scorer selection/configuration, payload
construction, and creation now live in `useExperimentVersionDraft`. Scorer
promotion uses immutable updates, and a creation response is ignored if the
active experiment changes while the request is pending. ExperimentDetail is
now 373 lines. Frontend TypeScript checking and the Vite production build
passed. No tests were run; E2E remains reserved for the end of the migration.

Experiment sharing state and actions now live in `useExperimentShare`. It owns
share-link creation, URL formatting, clipboard handling, and modal state; closing
the modal or changing experiments invalidates pending responses. ExperimentDetail
is now 322 lines. Frontend TypeScript checking and the Vite production build
passed. No tests were run; E2E remains reserved for the end of the migration.

Experiment run and cancel actions now live in `useExperimentRunActions`. Pending
responses are ignored when the experiment or selected version changes, avoiding
stale run-list and URL updates. ExperimentDetail is now 309 lines. Frontend
TypeScript checking and the Vite production build passed. No tests were run;
E2E remains reserved for the end of the migration.

Provider key persistence now writes versioned AES-GCM ciphertext and can still
read the existing legacy encoding. Invalid or unauthenticated ciphertext raises
a typed decryption error. Durable key changes update the in-memory mirror only
after commit, and scoped keys no longer enter the process-wide fallback.
Provider key endpoints now have explicit response models. Python syntax
compilation and whitespace checks passed. No tests were run; E2E remains
reserved for the end of the migration.

Provider construction now uses a registry, with `google` normalized to the
canonical `gemini` provider. Model-based provider inference moved out of
`ProxyService`; unsupported providers and unresolved model names raise typed
selection errors that continue through the proxy's HTTP 400 mapping. Gemini key
lookup retains the `GOOGLE_API_KEY` environment fallback. Python syntax
compilation and whitespace checks passed. No tests were run; E2E remains
reserved for the end of the migration.

Python and TypeScript SDK JSON/SSE decoding now lives in dedicated response
modules, and `AthenaClientError` is defined in a shared error module per SDK
while remaining available from existing public imports. Python keeps its
private decoder methods as delegating compatibility wrappers. TypeScript SDK
type checking, Python syntax compilation, and whitespace checks passed. No
tests were run; E2E remains reserved for the end of the migration.

Function request schemas now live in `backend/app/schemas/functions.py`, and
version listing/creation plus function invocation live in
`backend/app/routers/function_version_routes.py`. The `/functions` router
composes those routes while preserving all existing endpoint paths and handler
names. A static route inventory confirmed all 10 function endpoints; Python
syntax compilation and whitespace checks passed. No tests were run; E2E remains
reserved for the end of the migration.

Dataset request/response schemas are now in `backend/app/schemas/datasets.py`;
list/detail/create responses share `build_dataset_response`, and flush plus
version-history routes live in `backend/app/routers/dataset_history_routes.py`.
The `/datasets` router still composes the catalog, row, history, and promotion
endpoints. A static route inventory confirmed all existing dataset paths;
Python syntax compilation and whitespace checks passed. No tests were run; E2E
remains reserved for the end of the migration.


CachePayloadCodec now owns cache-key decoding, AES-GCM operations, and cache
value serialization while CacheService retains TTL storage, eviction, and
accounting. Existing cache helper methods delegate to the codec, preserving
ProxyResponseCache key normalization. Python syntax compilation and
whitespace checks passed. No tests were run.

AQL dashboard-builder query generation now lives in
backend/app/services/aql_builder.py; AQLParser.build_query_from_builder
continues to provide the same method through a delegating compatibility
boundary. aql_parser.py dropped from 233 to 195 lines. Python syntax
compilation and whitespace checks passed. No tests were run.

`ProxyPersistenceService` now also shapes successful proxy call spans and logs;
`ProxyService` retains inference orchestration and delegates record creation.
`ProxyProviderService` owns provider key configuration, provider resolution,
model listing, and usage-cost estimation behind the existing `ProxyService`
methods. `proxy_service.py` dropped from 322 to 222 lines. Python syntax
compilation and whitespace checks passed. No tests were run.

### Latest Clean Code migration increment (2026-09-27)

AQL dimensions and supported measures now execute as database-side SQL aggregations; p95 uses window functions and sorting/positive limits are applied after grouping in SQL. The existing SQLAlchemy database configuration remains in place, and choosing a dedicated OLAP engine is still open. Backend syntax compilation and whitespace checks passed. No tests were run; DB execution and final E2E flows remain outstanding.

The legacy experiment route now delegates one-row request execution, exact-match scoring, result shaping, and its existing per-row commit to `LegacyExperimentRowExecutor`; `ExperimentService` retains run setup and completion summaries. Backend syntax compilation passed; no tests were run.

The proxy completion endpoint now uses the public `ProxyService.resolve_provider` boundary when setting the response provider header instead of calling a private service method.

AQL clause scanning now ignores clause keywords inside quoted filter and shape-parameter values, including values containing escaped quotes.

Frozen replay record creation, anti-pattern matching, proxy completion response construction, proxy trace start, and Owl chat message assembly now use focused helpers. Proxy provider resolution is exposed through a public service method. Backend syntax compilation passed; no tests were run.

Guardrail condition results now use a typed `GuardrailMatch`; loading enabled rules and selecting the final action are separate from condition checks. The backend syntax check passed; no tests were run.

ReviewQueue now composes a typed loading/filter hook, search/status toolbar, result list, and detail panel. Frontend type checking and production build passed; no tests were run.

The legacy experiment executor now reuses the shared exact-match scorer while retaining the same normalization defaults and per-row result commit.

SDK timeout defaults remain intentionally unchanged for compatibility: TypeScript uses an opt-in timeout and Python defaults to 30 seconds. A unified default needs a versioned SDK policy.

Trace-list and trace-detail responses now share the same typed trace/span conversion helper; list query behavior and detail 404 messages are retained.

Guardrails and anti-pattern scoring now share one normalized text/overlap matcher while preserving their distinct pattern lookup and response details.

Clean Code migration final gate (2026-09-27): the seeded workspace fixture now mocks organizations as well as projects; ExperimentDetail handles its initial empty result state safely; and `/collaboration` provides project-scoped assignment, mention, and share-link lists using the existing API. Seven targeted Chromium customer flows passed (seeded logs, error filter, dashboard chart, trace collaboration/review/promotion, review-to-dataset, experiment run/compare/share, and collaboration lists). Frontend and TypeScript SDK typechecks, Python syntax compilation for 147 backend/SDK modules, Vite production build (1,209 modules), and `git diff --check` passed. No unit tests were written or run. The separate legacy E2E suite was stopped after its first three 30-second failures because its selectors and expected fixture names no longer match the current UI. AQL aggregation SQL still lacks database execution verification because SQLAlchemy is absent from the bundled Python runtime; the production OLAP engine choice remains open.
---

## Code-quality guardrails

- Anti-slop is vendored at `tools/oxlint/anti-slop/` so its rules remain reviewable and project-owned.
- Root `npm run lint` checks the frontend and TypeScript SDK with all anti-slop rules enabled as errors.
- Oxlint and its plugin runtime are pinned to matching versions. The lint command also pins Node 22.18 because loading local TypeScript lint plugins requires Node 22.18 or newer.
- The first migration pass removed a redundant conditional object-spread fallback. Existing anti-slop findings are intentionally visible rather than suppressed or downgraded; follow-up cleanup should replace broad dictionaries and assertions with domain contracts and boundary parsers.
