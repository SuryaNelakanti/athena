# Clean Code migration

This is the working plan for a behavior-preserving cleanup of Athena's backend,
frontend, SDKs, and supporting scripts. The public API, stored data, and user
flows are migration constraints. Existing uncommitted feature work in the
checkout must be preserved.

## Working rules

- Keep modules focused on one domain and give functions and data explicit names.
- Remove repeated logic where the shared behavior is genuinely the same.
- Prefer typed contracts and clear error paths over `any`, broad exceptions, or
  silent fallbacks.
- Keep persistence and network boundaries visible; avoid hidden side effects.
- Preserve route names, request and response shapes, and compatibility exports
  unless a deliberate migration is documented.
- Do not add or run unit tests. Run E2E flows only after the code migration is
  finished. Static compilation and type checking are allowed during migration.

## Progress

| Area | Completed | Remaining |
| --- | --- | --- |
| Frontend API | Split the single API facade into domain modules while preserving `api` and compatibility exports; centralized JSON/void response handling across all API domains; typed dataset, function, collaboration, review, experiment, provider, model-registry, operations, observability, and saved-view contracts. Dynamic fields in shared entities now use `unknown` instead of `any`, including telemetry, run graphs, datasets, experiment results, functions, attachments, review metadata, and logs. | Review dynamic fields for stronger domain-specific contracts and decide whether runtime response validation is needed at the transport boundary. |
| Frontend pages | Extracted playground models, request streaming transport and SSE decoding, the `usePlaygroundRuns` and `usePlaygroundTrace` lifecycle hooks, run comparison panel, trace modal, workspace/run-board/snapshot sidebar, prompt/context card, and variant configuration/output cards; shared structured-data formatting; typed playground config decoding/serialization; dashboard statistics and chart transforms, dashboard AQL configuration, stat card, custom chart grid, and guided/AQL chart builder; log filter configuration, AQL row parsing, and the typed result table with lineage and metric display; trace row, formatting, and lineage map; experiment result formatting, results filtering/summary/row-detail panel, typed comparison summary/row-diff panel, and controlled version creation and share dialogs. Experiment version config follows the backend model/task/scorer shape. Playground stream events, trace payloads, and run narrative tool/retrieval details are narrowed before display; shared unknown-safe error handling replaces explicit `any` catches across page actions. Dataset, experiment, review, and trace-related load errors now surface in the affected pages instead of only reaching the console. Routes load pages on demand. TanStack route typing is enabled with `strictNullChecks`; navigation and search state no longer need `any` casts, and search parameters are narrowed at the route boundary. TraceDetail now composes a dedicated span workspace, lineage-loading hook, and trace promotion/collaboration dialogs; reasoning content is narrowed from unknown telemetry values before rendering. LogTable is now a 68-line composition with dedicated log-data and saved-view hooks plus a focused filter toolbar; stale log, selected-log, lineage, and saved-view responses are discarded across dependency changes. Dashboard now composes focused data and chart-builder hooks; dashboard log/chart query failures are visible, and asynchronous chart responses are discarded after the chart selection changes. ExperimentDetail now composes an overview sidebar, a selection-keyed data hook, and a comparison workspace; stale experiment/run/result/dataset and comparison responses are ignored after their selections change, and comparison selections persist while the tab is hidden. Baseline/candidate and dataset-row load failures are surfaced, scorer configs are narrowed without casts, share-copy errors are shown, and a temperature of zero is preserved. Version draft and creation now live in `useExperimentVersionDraft`; scorer updates are immutable, and late creation responses are ignored after experiment changes. Experiment sharing now lives in `useExperimentShare`; requests are invalidated when the modal closes or the active experiment changes. Experiment run/cancel actions now live in `useExperimentRunActions`; responses are ignored after experiment/version selection changes. Run Narrative's selected-node details now live in a typed inspector component, with shared status and telemetry-value formatting helpers. SessionDetail now composes focused overview, run-list, timeline, and annotation components; annotation form state and its session-scoped create action live with the annotation panel, while session display helpers are shared. |
| Frontend logs | `LogFilterToolbar` now composes `SavedLogViewsMenu`, `LogFilterEditor`, and `ActiveLogFilters`; saved-view loading/errors and filter application preserve their existing toolbar state and callbacks. The composition dropped from 440 to 225 lines. | Review keyboard/empty-state behavior during the final E2E flow pass. |
| Frontend functions | `useFunctionCatalog` owns project-scoped loading, create/delete actions, filtering, and error state; `FunctionCreateModal` owns the controlled creation form; `FunctionCatalog` shares card rendering across built-in and custom sections. `FunctionsList` dropped from 418 to 111 lines. | Review list/filter empty states during the final E2E flow pass. |
| Frontend app shell | `LogsRoute` and `RunsRoute` now have route-page modules; `useWorkspaceBootstrap` owns organization/project loading, retries, and first-project creation, while `FirstProjectSetup` owns onboarding UI. `App.tsx` dropped from 401 to 121 lines and remains the project/layout/Owl composition root. | Review startup/retry and first-project onboarding during the final E2E flow pass. |
| Frontend dashboard charts | `DashboardChartBuilder` now composes `GuidedChartFields`, `AqlChartFields`, and `DashboardChartPreview`; the parent retains chart identity/type and save/cancel actions. It dropped from 343 to 124 lines. `useDashboardChartPreview` owns preview request/result/error/loading state and ignores responses after the project or preview input changes or the hook unmounts. | Review guided/AQL switching, templates, and preview/save flows during final E2E. |
| Frontend run narrative | `useRunNarrativeData` owns run/graph/eval requests, retry, evaluation creation, and typed score filtering; `RunEvaluationPanels` owns evaluation configuration and summary UI. `RunNarrative` retains view/selection coordination and dropped from 426 to 255 lines. `RunGraph` remains one SVG/positioned-node renderer because edge geometry, node positions, selection, and auto-centering share the same coordinate model. | Review graph retry and evaluation flows during the final E2E flow pass. |
| Frontend sessions | `useSessionListData` owns project/filter loading, stale-request guards, search filtering, and summary counts. `SessionListControls` owns stats and filters; `SessionListResults` owns loading/error/empty states and session cards; status and timestamp formatting are shared helpers. `SessionList.tsx` dropped from 304 to 49 lines. | Review session filters and selection behavior during the final E2E flow pass. |
| Frontend datasets | DatasetDetail now renders eval/resource rows and version history through focused panels, with shared row-kind and evaluation-label helpers; the shared collaboration hook and modal handle dataset and session share links. `useDatasetRowCreation` owns row validation, API submission, reload, and reset; `DatasetRowCreateModal` owns the controlled eval/resource form. DatasetDetail dropped from 386 to 261 lines. | Review row creation and its validation during the final E2E flow pass. |
| Frontend review | `useReviewQueue` owns project-scoped loading, filtering, stale-response guards, and selection; `ReviewQueueToolbar` and `ReviewQueueResults` own status/search controls and list rendering; `ReviewDetailPanel` owns the selected-item actions. | Review list keyboard and empty-state behavior remains scheduled for final E2E. |
| Frontend settings | Provider/model loading, refresh, credential changes, individual model toggles, and bulk model actions now live in `useProviderSettings`; `ProviderSettingsPanel` owns that UI, and the route composes it with appearance settings. Overlapping and post-unmount loads are discarded. | Review remaining page-level settings state if the surface grows. |
| Frontend assistant | `OwlPlaybookPanel` owns the playbook selector and action-specific input UI as a controlled component; `useOwlExperiments` owns project-scoped experiment loading, option shaping, retries, and stale-response guards; `useOwlAssistant` owns chat/playbook state, validation, requests, and message updates. | Review remaining global-widget context derivation and dialog composition. |
| Frontend playground | `usePlaygroundWorkspace`, `usePlaygroundSnapshot`, `usePlaygroundComparison`, `usePlaygroundPrompt`, `usePlaygroundVariants`, `usePlaygroundPersistence`, and `usePlaygroundSelection` own scoped workspace loading, snapshot actions, comparison state, prompt/context editing, variant state/CRUD, create/update/delete requests, saved selection, and dirty-state coordination. `PlaygroundSidebar` composes focused workspace, run-board, and snapshot cards through shared typed state contracts. Prompt/variant action callbacks are stable across renders. Labs now delegates page rendering to the typed `PlaygroundWorkspaceView`; the route remains responsible for state/hook orchestration and assembled component props. `Labs.tsx` dropped from 385 to 344 lines. | Review the remaining editor composition and lifecycle boundaries. |
| Backend functions | Function request schemas now live in `schemas/functions.py`; version listing/creation and invocation live in `function_version_routes.py`, composed by the existing functions router with the same endpoint paths and handler names. | Review duplicate-name concurrency and version/config semantics during final flow verification. |
| Backend datasets | Dataset request/response models live in `schemas/datasets.py`; list/detail/create responses share `build_dataset_response`; flush and version-history endpoints live in `dataset_history_routes.py`, composed by the existing datasets router. Trace and agent-run promotion endpoints remain in `dataset_promotions.py`. `DatasetService` remains one versioned row lifecycle so each revision and its dataset-version marker share the same session/commit boundary. All dataset endpoint paths and response shapes are retained. | Review row-history and catalog flows during the final E2E pass. |
| Backend MCP tools | MCP tool request schemas live in `schemas/mcp_tools.py`; documentation, object/permalink, AQL/schema, and experiment-summary handlers live in four focused routers composed by `mcp_tools.py`. The `/mcp/tools` route paths, dependencies, and handler exports are preserved. | Review OAuth-protected tool contracts during the final E2E pass. |
| Backend scoring | `ScorerService` retains its public methods and dispatcher while delegating deterministic algorithms to `deterministic_scorers.py` and semantic evaluation to `LLMJudgeScorer`; per-scorer errors remain result values. | Review scorer configuration normalization and the remaining dispatcher boundaries. |
| Backend session evaluation | Pure trajectory-scoring algorithms and telemetry text extraction live in `session_eval_scorers.py`; `SessionEvalService.create_eval` now composes run selection, trace-input loading, scorer dispatch, and versioned persistence through named methods and a typed trace-data value. | Review evaluation configuration and persistence in final flow verification. |
| Backend | AQL shapes and parsing are separate; supported dimensions, measures, p95, sorting, and positive limits compile to database-side SQL in AQLAggregationExecutor; literal parsing/formatting and quote-aware splitting now live in `AQLValueCodec`, with `AQLParseError` shared from a boundary module; dashboard-builder query generation now lives in `aql_builder.py` behind the parser compatibility method; consolidated dataset row revision persistence and experiment run summaries; moved session schemas, list/detail/read response shaping, run graph construction, run comparison assembly, frozen replay persistence, experiment run execution, and database-backed anti-pattern scoring into dedicated modules; shared the scorer result contract; surfaced non-fatal score-enqueue and worker failures; centralized expected-text extraction with explicit nested-shape checks. Experiment configuration tuples and dataset input boundaries are typed; persisted model/task/scorer configuration is now validated and normalized by `ExperimentRunConfig` before run orchestration, preserving the existing defaults and failure messages. Persisted run model/task/scorer sections are checked at the executor boundary, provider/model identifiers must be non-empty strings, and explicit zero temperature is retained through version creation and execution. Experiment input conversion is shared by both run services. LLM judge prompt construction and response parsing are separate helpers; scorer failures remain row-level results and emit a structured warning. The backwards-compatible legacy experiment route delegates each row lifecycle to `LegacyExperimentRowExecutor`, reuses the deterministic exact-match scorer, and preserves its per-row commit. Prompt Test input formatting now lives in `prompt_test_input.py`; `PromptTestRowExecutor` owns per-row model calls, scoring, aggregation input, and result persistence, while `PromptTestService.execute_prompt_test` remains as the compatibility entry point and run-level status/error owner. Model and run failures use structured logging while preserving per-row/run error records. Online-score review-item creation/update now lives in `OnlineScoringReviewService`; `OnlineScoringService.score_log` retains span resolution, scoring, score metadata, and the shared commit boundary. Startup seed events and provider key/model-list warnings use logging instead of stdout. Provider-key writes now use nonce-based AES-GCM with legacy read compatibility and typed decryption errors; cryptographic encoding now lives in `ProviderKeyCipher`, while `ProviderKeyStore` retains environment fallback, durable scope resolution, and persistence; in-memory mirrors update only after commit, scoped keys stay out of the global fallback, and provider routes use explicit response models. Provider dispatch now uses a registry; provider aliases normalize to canonical names, and model-based selection raises typed errors that the proxy maps through its existing HTTP 400 path. Gemini key lookup retains the GOOGLE_API_KEY fallback. Owl and MCP documentation search now share a typed service. `ProxyTraceService` owns trace/span context resolution and creation, with `ProxyCallContext` shared from a boundary module; `ProxyPersistenceService` owns successful and failed call record shaping, trace/log commits, trace aggregates, and score-job enqueueing; `ProxyProviderService` owns provider configuration, model listing, provider selection, and cost estimation. Direct and cache-hit completions share one success-recording path, stream setup, SSE encoding, content/reasoning aggregation, and completion persistence now live in `ProxyStreamingService`; fragments are joined once for the final snapshot, and streamed and non-streamed failures share one failure path while preserving the original exception. CachePayloadCodec owns generic cache-key decoding, AES-GCM, and value serialization while CacheService retains TTL storage and accounting. Proxy cache key preparation, encrypted lookup, cached response validation, and payload serialization live in a dedicated service; explicit cache TTL values are applied to stored entries. Session-evaluation automation now runs in the eval creation flow; annotation creation no longer references an undefined eval record. MCP OAuth/PKCE and tool endpoints live in routers composed by `mcp.py`; documentation search, object/permalink access, AQL/schema queries, and experiment summaries use focused tool routers while preserving the existing `/mcp` paths and contracts. Session annotation, evaluation, and run endpoints now live in focused routers composed by `sessions.py`; the 13 existing session route signatures are retained. Experiment version creation and run routes now live in `experiment_version_routes.py`; `experiments.py` composes that child router in place and retains the same 16 endpoint methods, paths, and handler names. The `/v1` proxy router composes separate inference, span feedback/score, and model/cache operation route modules; its seven existing method/path/handler pairs remain unchanged, and feedback request schemas live in `schemas/proxy_observability.py`. Log request/response contracts live in `schemas/logs.py`; shared single/batch normalization, persistence, and best-effort scoring enqueueing live in `services/log_ingestion.py`; query and delete routes live in `log_query_routes.py`, composed with ingestion routes by `logs.py`. The five existing method/path/handler pairs are retained. Review request schemas now live in `schemas/reviews.py`; queue CRUD and trace-derived create/promote actions are composed from `review_catalog_routes.py` and `review_trace_routes.py` under the existing `/reviews` prefix. All six endpoint signatures and handler names remain available from `reviews.py`. | Review AQL query shapes and the dedicated OLAP engine during final E2E; resolve SDK fail-open timeout defaults and any remaining session/router boundaries. |
| SDKs | Centralized duplicated completion body/header construction in TypeScript and headers in Python; made HTTP status errors bypass transport retry handling; aligned public `AthenaClientError` behavior and HTTP status fields across SDKs; applied TypeScript timeouts to fail-open requests and streams, wrapped invalid JSON responses, and reject invalid retry/timeout configuration. TypeScript proxy and fallback text requests share one retry helper, and both SSE routes share one retry/timeout loop. Python text paths share a retrying opener, and primary/fallback SSE paths share one retry loop. Both clients now fail open for successful but unusable JSON responses, and TypeScript flushes UTF-8 data and parses a final SSE line at EOF. JSON and SSE decoding now live in dedicated modules for both SDKs; existing client error exports and Python decoder methods remain compatible. Each client remains a cohesive inference lifecycle boundary across request shaping, retry, streaming, and fallback. | Preserve and document legacy timeout defaults (TypeScript opt-in, Python 30 seconds) until a versioned SDK policy is chosen; exercise configured timeout and fail-open behavior during final E2E. |
| E2E readiness | Resolved merge markers in the seeded frontend E2E fixtures and removed three no-op placeholder specs. | Run the end-to-end customer flows after migration and repair any failures. |

## Completion gate

The migration is complete when each production module has been reviewed for
cohesion, duplication, naming, error handling, and types; remaining large
modules have a documented reason to stay together; frontend and SDK type checks
and Python compilation pass; and the customer flows pass E2E testing. This
document must then record any behavior changes and residual risks.

The frontend currently passes TypeScript checking with `strictNullChecks` and
a Vite production build with the local `runner` config loader. Its initial JavaScript chunk fell from
about 992 KB to 475 KB after route loading was added. TypeScript now rejects
unused locals and parameters across the frontend and E2E source tree.

Upstream provider exceptions are translated at the provider-call boundary into
a typed error with a safe public message. Non-streaming failures map to HTTP 502
with provider-origin headers; unexpected gateway failures return a generic HTTP
500 detail. Streaming failures persist the safe provider message and terminate
the stream. Athena proxy SSE consumers now require the terminal `[DONE]` marker;
an incomplete response retries and can fail open before yielding chunks, while
an incomplete response after yielding chunks becomes a client error. Direct
fallback-provider streams keep their permissive EOF handling. Static Python
compilation, TypeScript checking, and whitespace checks passed. No tests were
run; E2E remains reserved for the end of the migration.

Session timeline existence checks, ordered event queries, and pagination now
live in `SessionQueryService`; the route retains its existing path, response,
ordering, pagination defaults, and 404 behavior. Python syntax compilation and
whitespace checks passed. Four experiment operations now share an internal
error mapper that logs the operation and exception class without returning raw
exception text to clients; existing expected-error mappings are retained.
Owl chat now uses the same safe provider error contract and hides unexpected
internal exception text. Python syntax compilation and whitespace checks passed.
No tests were run.

SessionDetail now delegates timeline and annotation loading to a focused hook
that discards stale responses when the selected session changes. Timeline and
annotation load errors and annotation/share actions are shown in context;
pending annotation and share results cannot update the newly selected session.
Frontend TypeScript checking and whitespace checks passed. No tests were run;
E2E remains reserved for the end of the migration.

PromptTestDetail data loading and polling now live in
`usePromptTestDetailData`. Poll requests do not overlap, stale route responses
are discarded, and load errors remain distinct from missing tests. Reruns
restart polling for the selected test only. Frontend TypeScript checking and
whitespace checks passed. No tests were run; E2E remains reserved for the end
of the migration.

ReviewQueue now discards stale dataset/review loads after project or filter
changes, clears data when no project is selected, and resets note editing when
the selected item changes. Frontend TypeScript checking and whitespace checks
passed. No tests were run; E2E remains reserved for the end of the migration.

SessionList clears project/filter-scoped results before loading, ignores late
responses, and shows load failures instead of converting them to an empty
queue. Frontend TypeScript checking and whitespace checks passed. No tests were
run; E2E remains reserved for the end of the migration.

Logs and Agent Runs route loaders now discard responses after route changes and
show request errors separately from missing trace/session records. The redundant
selected-log fetch was removed because the route only needs its ID, already
present in search state. Frontend TypeScript checking and whitespace checks
passed. No tests were run; E2E remains reserved for the end of the migration.

DatasetDetail now delegates dataset, row, history, and revision loading to
`useDatasetDetailData`. Requests discard results after the dataset route
changes, and dataset, row, history, and row-history failures are visible with
retry actions. Share and clipboard operations ignore stale route results and
show failures in the modal. Frontend TypeScript checking and whitespace checks
passed. No tests were run; E2E remains reserved for the end of the migration.

DatasetList and FunctionsList now report fetch failures separately from empty
data, ignore late project responses, and provide retries; function deletion
errors are user-visible. PromptTestModal exposes model/scorer option failures
and ignores responses after closing or changing projects. Owl's experiment
picker and Run Narrative graph/evaluation loads preserve actionable errors;
Run Narrative ignores stale run and evaluation responses. Frontend TypeScript
checking and whitespace checks passed. No tests were run; E2E remains reserved
for the end of the migration.

App startup and first-project creation now surface failures and allow workspace
initialization to retry. Playground workspace data loading is project-scoped,
stale refreshes are ignored, and load and clipboard failures are shown in the
UI. Frontend TypeScript checking and whitespace checks passed. No tests were
run; E2E remains reserved for the end of the migration.

Automation action failures now log rule context and exception type while
persisting a safe generic error message instead of raw exception text. Python
syntax compilation and whitespace checks passed. No tests were run; E2E remains
reserved for the end of the migration.

Mutable list and mapping defaults in SQLModel entities and Pydantic API
schemas now use per-instance factories. Python source compilation passed. The
available Python runtime does not have SQLModel installed, so runtime model
imports could not be checked in this environment. No tests were run; E2E
remains reserved for the end of the migration.

Session ingest request/response contracts moved to `schemas/session_ingest.py`;
pure status, metadata, tag, and trace assembly live in
`services/session_ingest_normalizer.py`, tool-call and retrieval/RAG span payload
rules live in `services/session_ingest_span_normalizer.py`, and persistence
orchestration lives in `services/session_ingest_service.py`. The `/ingest` route
and response shape remain unchanged; its router dropped from 469 to 18 lines.
Python syntax compilation and whitespace checks passed. Runtime imports could
not be checked because SQLModel is missing from the available Python runtime.
No tests were run; E2E remains reserved for the end of the migration.

The monolithic frontend contract catalog is now split into domain modules for
core telemetry, sessions, datasets, playgrounds, experiments, operations,
functions, collaboration, monitoring, logs/AQL, and prompt tests. The original
`src/types.ts` path remains as a re-export barrel. Frontend type checking,
production build, and whitespace checks passed. No tests were run; E2E remains
reserved for the end of the migration.

The large `app.models` declaration file is now divided into 13 domain modules
under `app/db_models/`; `app.models` explicitly re-exports all 56 model and
schema classes to preserve existing imports. Project, TraceModel, SpanModel,
and their relationship declarations remain co-located. Python compilation,
static validation of 137 named model imports, and whitespace checks passed.
Runtime imports remain unverified because SQLAlchemy is unavailable in the
bundled Python environment. No tests were run; E2E remains reserved for the end
of the migration.

Run Narrative's selected-node inspector and its tool/retrieval document
formatting now live in `RunNodeInspector`; the parent keeps run/eval loading,
timeline/graph selection, and page composition. Shared status and string-list
formatters prevent the two views from drifting. The parent dropped from 738 to
403 lines. Frontend TypeScript checking and the Vite production build passed.
No tests were run; E2E remains reserved for the end of the migration.

SessionDetail now composes the run summary/context cards, sorted runs list,
timeline, and annotation workflow from focused components under
`features/sessions/`. Annotation creation owns its input state and keeps the
existing stale-session guard; the route page retains session loading and
composition; sharing uses the shared collaboration hook and modal. The page
dropped from 624 to 86 lines.
Frontend TypeScript checking, the Vite production build, and whitespace checks
passed. No tests were run; E2E remains reserved for the end of the migration.

DatasetDetail now composes its eval/resource row display and dataset version history from dedicated panels. Shared row-kind and evaluation-label helpers serve filtering, counts, and rendering. The page dropped from 639 to 356 lines. Frontend TypeScript checking, the Vite production build, and whitespace checks passed. No tests were run; E2E remains reserved for the end of the migration.

Dataset and session sharing now use the shared `useShareLink` hook and `ShareLinkModal`. The hook preserves target-scoped stale-response guards and the dataset-specific unavailable-clipboard message. Frontend TypeScript checking, the Vite production build, and whitespace checks passed. No tests were run; E2E remains reserved for the end of the migration.

Dataset row creation now lives in `useDatasetRowCreation`, with controlled form rendering in `DatasetRowCreateModal`. The hook preserves the eval/resource payload shapes, required-field checks, row reload, successful form reset, and error handling. DatasetDetail dropped from 386 to 261 lines. Frontend TypeScript checking, the Vite production build, and whitespace checks passed. No tests were run; E2E remains reserved for the end of the migration.

TypeScript and Python SDK JSON/SSE decoding now live in `responseDecoding.ts` and `response_decoding.py`, respectively. `AthenaClientError` has a dedicated module in each SDK while remaining exported from the existing client/package entry points; Python retains its private decoder methods as delegating compatibility wrappers. SDK client modules dropped from 406 to 342 TypeScript lines and 316 to 293 Python lines. TypeScript SDK type checking, Python syntax compilation, and whitespace checks passed. No tests were run; E2E remains reserved for the end of the migration.

Function request schemas now live in `schemas/functions.py`, and function version list/create plus invoke endpoints live in `function_version_routes.py`. The existing functions router composes the child routes and re-exports their handlers and request types. A static route inventory confirmed all 10 function endpoint methods and paths; 109 backend modules compiled in memory, and whitespace checks passed. No tests were run; E2E remains reserved for the end of the migration.

Dataset request/response models now live in `schemas/datasets.py`, repeated DatasetResponse shaping uses `build_dataset_response`, and flush plus dataset/row-history endpoints live in `dataset_history_routes.py`. The existing `/datasets` router composes history and promotion routes. A static route inventory confirmed all dataset catalog, row, history, flush, and promotion paths; 112 backend modules compiled in memory, and whitespace checks passed. No tests were run; E2E remains reserved for the end of the migration.

Session-list fetching, stale-request protection, search/filter state, and summary counts now live in `useSessionListData`. Controls and result/card rendering are separate components, and status/timestamp formatting is shared in a small utility module. `SessionList.tsx` dropped from 304 to 49 lines. Frontend TypeScript checking, the Vite production build, and whitespace checks passed. No tests were run; E2E remains reserved for the end of the migration.

MCP request schemas now live in `schemas/mcp_tools.py`, and documentation, object/permalink, AQL/schema, and experiment-summary tools live in four routers composed by `mcp_tools.py`. The parent `/mcp` prefix, OAuth dependencies, eight method/path pairs, handler names, and request models remain available. A static route inventory matched all eight tools; 117 backend modules compiled in memory, and whitespace checks passed. No tests were run; E2E remains reserved for the end of the migration.

The dashboard chart builder now composes separate guided configuration, AQL configuration, and preview components; `DashboardChartBuilder` retains the chart name/type and save/cancel boundary. The builder dropped from 343 to 124 lines. Frontend TypeScript checking, the Vite production build, and whitespace checks passed. No tests were run; E2E remains reserved for the end of the migration.

`PlaygroundSidebar` now composes `PlaygroundWorkspaceCard`, `PlaygroundRunBoardCard`, and `PlaygroundSnapshotCard`, with the existing state contracts collected in `PlaygroundSidebarState`. The sidebar composition file dropped from 314 to 17 lines. Frontend TypeScript checking, the Vite production build, and whitespace checks passed. No tests were run; E2E remains reserved for the end of the migration.

ReviewQueue now delegates selected-review details, status changes, notes, and dataset promotion to `ReviewDetailPanel`. Its panel state resets with the selected review where it did before; expansion and promotion drafts retain their existing behavior. The route page dropped from 546 to 228 lines. Frontend TypeScript checking, the Vite production build, and whitespace checks passed. No tests were run; E2E remains reserved for the end of the migration.

Playground workspace loading and refresh now live in `usePlaygroundWorkspace`.
The hook owns project-scoped playground, dataset, and model-registry requests,
clears data when the project changes, and ignores stale responses. Labs retains
editor state and delegates workspace refresh actions to the hook. Frontend
TypeScript checking, the Vite production build, and whitespace checks passed.
No tests were run; E2E remains reserved for the end of the migration.

Playground snapshot-to-experiment status, validation, creation, and reset
behavior now live in `usePlaygroundSnapshot`; Labs keeps the form selections and
delegates the action and reset calls to the hook. The page is now 537 lines
(down from 573 after the workspace-load extraction). Frontend TypeScript
checking, the Vite production build, and whitespace checks passed. No tests
were run; E2E remains reserved for the end of the migration.

Provider-key and model-registry loading and actions now live in
`useProviderSettings`, including credential updates, model synchronization,
single-model and bulk toggles, and configured-provider expansion. Superseded or
post-unmount loads are ignored. `ProviderSettingsPanel` now owns the provider
statistics and configuration UI, separating it from appearance controls.
Settings dropped from 493 to 113 lines. Frontend TypeScript checking, the Vite
production build, and whitespace checks passed. No tests were run; E2E remains
reserved for the end of the migration.

Owl's playbook selector and action-specific inputs now render in the controlled
`OwlPlaybookPanel`. Action selection, field values, experiment-load errors,
retry, and execution remain coordinated by the global widget; expansion state
stays in the parent so it persists when the assistant panel is closed and
reopened. `OwlWidget` dropped from 482 to 363 lines. Frontend TypeScript
checking, the Vite production build, and whitespace checks passed. No tests
were run; E2E remains reserved for the end of the migration.

Project-scoped experiment loading, option formatting, and retry state now live
in `useOwlExperiments`; stale responses are ignored after project changes,
reloads, or unmount. `OwlWidget` is now 336 lines. Frontend TypeScript
checking, the Vite production build, and whitespace checks passed. No tests
were run; E2E remains reserved for the end of the migration.

Owl's chat and playbook action state and orchestration now live in
`useOwlAssistant`, including input validation, docs/experiment lookups, proxy
chat requests, messages, loading, and action errors. The widget retains global
placement and page-context construction, while the playbook form remains
controlled by the hook state. `OwlWidget` is now 191 lines. Frontend TypeScript
checking, the Vite production build, and whitespace checks passed. No tests
were run; E2E remains reserved for the end of the migration.

Trace-to-dataset and run-to-dataset promotion routes now live in
`dataset_promotions.py`, composed under the existing `/datasets` router. A
static route inventory confirmed all 12 methods, paths, and handler names are
present; Python syntax compilation and whitespace checks passed. No tests were
run; E2E remains reserved for the end of the migration.

LLM judge invocation, prompt construction, response parsing, and error-result
creation now live in `LLMJudgeScorer`; `ScorerService.score_llm_judge` remains
the compatibility entry point used by experiment, prompt-test, online, and
session scoring flows. Python syntax compilation and whitespace checks passed.
No tests were run; E2E remains reserved for the end of the migration.

Exact-match, contains, and regex algorithms now live in
`deterministic_scorers.py`; `ScorerService` preserves its existing public
methods and delegates each implementation. After the LLM judge extraction,
`ScorerService` dropped from 295 to 221 lines. Python syntax compilation and
whitespace checks passed. No tests were run; E2E remains reserved for the end
of the migration.

Session-evaluation text extraction and tool-correctness, path-efficiency, and
outcome scoring algorithms now live in `session_eval_scorers.py`.
`SessionEvalService` retains run selection, orchestration, aggregation, and
versioned persistence. The service dropped from 417 to 169 lines. Python syntax
compilation and whitespace checks passed. No tests were run; E2E remains
reserved for the end of the migration.

Playground run comparison now lives in `usePlaygroundComparison`, including
default run selection, manual selection state, diff generation, and cleanup
when selected runs are removed or cleared. Labs dropped from 537 to 509 lines.
Frontend TypeScript checking, the Vite production build, and whitespace checks
passed. No tests were run; E2E remains reserved for the end of the migration.

Prompt/system text, input, context messages, editor mutations, and new/load
resets now live in `usePlaygroundPrompt`; Labs still coordinates these values
with run and snapshot configuration. The page dropped from 509 to 491 lines.
Frontend TypeScript checking, the Vite production build, and whitespace checks
passed. No tests were run; E2E remains reserved for the end of the migration.

Variant defaults and normalization, add/update/remove operations, and cleanup
of runs/comparison selections tied to a removed variant now live in
`usePlaygroundVariants`. The page dropped from 491 to 461 lines. Frontend
TypeScript checking, the Vite production build, and whitespace checks passed.
No tests were run; E2E remains reserved for the end of the migration.

Playground create, update, and delete requests now live in
`usePlaygroundPersistence`, including saving state, workspace refresh, and
action error reporting. Labs retains the editor and saved-playground state,
and supplies reset/update callbacks. The page dropped from 461 to 444 lines.
Frontend TypeScript checking, the Vite production build, and whitespace checks
passed. No tests were run; E2E remains reserved for the end of the migration.

AQL dashboard-builder query generation now lives in `aql_builder.py`; `AQLParser.build_query_from_builder` delegates with the parser's configured shape map and alias helper, preserving that compatibility method. `aql_parser.py` dropped from 233 to 195 lines. All 119 backend modules compiled in memory and whitespace checks passed. No tests were run; E2E remains reserved for the end of the migration.

`CachePayloadCodec` now owns cache-key decoding, AES-GCM encryption/decryption, and cache value serialization. `CacheService` retains TTL storage, eviction, statistics, and delegating compatibility methods; `ProxyResponseCache` uses its existing key-normalization boundary. All backend modules compiled in memory and whitespace checks passed. No tests were run; E2E remains reserved for the end of the migration.

`ProxyPersistenceService` now shapes successful call spans and logs as well as
committing records, updating trace aggregates, and enqueueing score jobs.
`ProxyService` retains completion orchestration and delegates record creation.
`ProxyProviderService` owns provider key configuration, provider resolution,
model listing, and token cost estimation; the existing `ProxyService` helper and
model-list methods delegate to it. `proxy_service.py` dropped from 322 to 222
lines. All 120 backend modules compiled in memory and whitespace checks passed.
No tests were run; E2E remains reserved for the end of the migration.
Playground editor rendering now lives in `PlaygroundWorkspaceView`, with typed sidebar, prompt, variant-grid, comparison, and trace state props. `Labs.tsx` retains hook/state orchestration and assembles those props; it dropped from 385 to 344 lines. Frontend TypeScript checking, the Vite production build, and whitespace checks passed. No tests were run; E2E remains reserved for the end of the migration.

Persisted experiment model, task, and scorer settings now parse through `ExperimentRunConfig`; `ExperimentRunSummary` owns row score averages and usage/latency aggregation, while the executor retains run/session orchestration and row execution. Invalid configuration keeps the existing failure messages and temperature/prompt defaults. `experiment_run_executor.py` dropped from 286 to 171 lines. All backend modules compiled in memory and whitespace checks passed. No tests were run; E2E remains reserved for the end of the migration.

Dashboard AQL preview requests and result state now live in `useDashboardChartPreview`; changing the project, chart mode, builder, or advanced query invalidates stale responses and clears the old preview. TypeScript checking, the Vite production build, and whitespace checks passed. No tests were run; E2E remains reserved for the end of the migration.

`ProviderKeyCipher` now owns versioned AES-GCM encryption and legacy ciphertext decoding; `ProviderKeyStore` delegates through its existing `encrypt_key`/`decrypt_key` methods and retains the decryption error export. All 122 backend modules compiled in memory and whitespace checks passed. No tests were run; E2E remains reserved for the end of the migration.

Tool-call and retrieval span schema normalization now live in `session_ingest_span_normalizer.py`, called by the existing trace builder; the ingest router and persisted span construction retain the same payload contract. All 123 backend modules compiled in memory and whitespace checks passed. No tests were run; E2E remains reserved for the end of the migration.

Log ingestion schemas and write paths are separated from log query/delete routes. Shared status/level normalization and record shaping now serve both single and batch ingestion; best-effort score enqueue remains after the same commit boundary. Static AST route inventory matched all five existing method/path/handler pairs, all 127 backend modules compiled in memory, and whitespace checks passed. No tests were run; E2E remains reserved for the end of the migration.

Proxy inference, span feedback/scoring, and model/cache operations now live in focused routers composed under the unchanged `/v1` prefix. Feedback request schemas moved to `schemas/proxy_observability.py`; a static AST inventory matched all seven route method/path/handler pairs. All 131 backend modules compiled in memory and whitespace checks passed. No tests were run; E2E remains reserved for the end of the migration.

Review request contracts and generic queue CRUD are separated from trace-derived review creation and dataset promotion, composed under the existing `/reviews` router. Static AST inventory matched all six method/path/handler pairs, all 134 backend modules compiled in memory, and whitespace checks passed. No tests were run; E2E remains reserved for the end of the migration.

`ExperimentRunSummary` owns incremental score averages and token/cost/latency accumulation; `ExperimentRunExecutor` composes run preparation, start, row iteration/processing, and finalization through named methods. `execute_run` dropped from 123 to 15 lines, while score fields, row commits, cancellation checks, and final status behavior remain in the same order. All backend modules compiled in memory and whitespace checks passed. No tests were run; E2E remains reserved for the end of the migration.

Session ingest persistence now lives in `SessionIngestService`; the route retains the `/ingest` path and response model and maps typed domain conflicts to the same HTTP 400 details. Named steps separate session/run upserts, trace validation, event and receipt persistence, summary refresh, and automation evaluation. Static route inventory matched `POST /ingest`; all 136 backend modules compiled in memory and whitespace checks passed. No tests were run; E2E remains reserved for the end of the migration.

Prompt-test input/template formatting and run execution now live in focused modules. `PromptTestRowExecutor` owns one row lifecycle and its result persistence; the existing `PromptTestService.execute_prompt_test` entry point remains and delegates the run while retaining overall status/error handling. All backend modules compiled in memory and whitespace checks passed. No tests were run; E2E remains reserved for the end of the migration.

Online low-score review creation and refresh now live in `OnlineScoringReviewService`; `OnlineScoringService` passes the existing score and telemetry data and commits both changes in the original transaction. The scoring method dropped from 121 to 80 lines. All 139 backend modules compiled in memory and whitespace checks passed. No tests were run; E2E remains reserved for the end of the migration.

`SessionEvalService.create_eval` now composes run selection, trace input loading, scorer dispatch, and versioned persistence through focused methods; the scorer order, validation messages, summary fields, and uncommitted return behavior are retained. All 139 backend modules compiled in memory and whitespace checks passed. No tests were run; E2E remains reserved for the end of the migration.

`ExperimentRunExecutor.execute_run` now coordinates `_prepare_run`, `_mark_run_started`, `_execute_rows`/`_execute_row`, and `_finish_run`; its body dropped from 123 to 15 lines. Per-row result commits and cancellation checks keep their prior order. All 139 backend modules compiled in memory and whitespace checks passed. No tests were run; E2E remains reserved for the end of the migration.

AQL dimensions and supported measures now compile to SQL GROUP BY and aggregate expressions in aql_aggregation.py; p95 uses database window functions, and sorting/positive limits run against the aggregated SQL result. AQLService retains shape/filter resolution and non-aggregate row selection. All 140 backend modules compiled in memory and whitespace checks passed. No tests were run; database execution and E2E remain unverified until the final phase. The production OLAP engine decision remains open.

The backwards-compatible legacy experiment endpoint now delegates each row request, exact-match score, result shaping, and row commit to LegacyExperimentRowExecutor; ExperimentService retains dataset selection and run-level status/summary commits. The per-row commit and response payload fields are unchanged. All backend modules compiled in memory and whitespace checks passed. No tests were run; E2E remains reserved for the end of the migration.

AQL clause discovery now skips keywords inside quoted values and handles escaped quotes by counting preceding backslashes; shape resolution and supported measures are documented for final E2E review. Python syntax compilation and whitespace checks passed. No tests were run.

Frozen replay creation now keeps the trace/run/replay transaction in a short coordinator and builds replay traces, spans, runs, and replay records with focused helpers. Anti-pattern scoring separates database candidate loading, typed match records, matching, and result formatting. Proxy completion now separates cache/header policy from streaming and JSON response construction; provider resolution is a public ProxyService method, and successful proxy persistence delegates span, trace, and log shaping. Trace start now separates new-trace and call-span construction. Owl chat message assembly is a focused helper. Backend syntax compilation and whitespace checks passed. No tests were run; E2E remains reserved for the end of the migration.

Guardrail evaluation now uses a typed GuardrailMatch, with enabled-rule loading and final block/warn/flag/allow selection separated from individual condition checks. Frozen replay, anti-pattern scoring, proxy persistence, proxy trace creation, and Owl message assembly retain focused helpers; completion routing keeps its current paths and response/error contracts. Backend syntax compilation and whitespace checks passed. No tests were run; E2E remains reserved for the end of the migration.

ReviewQueue now composes useReviewQueue, ReviewQueueToolbar, and ReviewQueueResults around ReviewDetailPanel; list rendering, status/search controls, and the project-scoped request lifecycle are separated. The review list/filter flow remains scheduled for final E2E verification. Frontend TypeScript checking, Vite production build, and whitespace checks passed. No tests were run.

Trace-list and trace-detail endpoints now share one typed database-to-API trace conversion helper; list filtering, batched span loading, ordering, and the detail endpoint error messages remain at their existing boundaries. Backend syntax compilation and whitespace checks passed. No tests were run; trace screens remain in the final E2E pass.

Guardrail checks and the anti-pattern scorer now share anti_pattern_matching for normalized substring and word-overlap decisions. Their distinct candidate loading, expected-text extraction, threshold defaults, and user-facing result details remain separate. Python syntax compilation and whitespace checks passed. No tests were run; scorer/guardrail behavior remains in the final E2E review.

The remaining longest backend methods have been reviewed and kept where they form a single domain operation: ProxyService.chat_completion coordinates one provider/cache/trace/persistence lifecycle; PromptTestExecutor.execute_prompt_test owns one run-level status/error boundary while its row work is extracted; OnlineScoringService.score_log commits score metadata and its review upsert together; ExperimentV2Service.create_version validates and persists one version with its initial main-version pointer; scoring methods implement individual algorithms; and session-ingest/run-graph builders each transform one related payload. Their boundaries are recorded for final E2E review rather than split into smaller helpers without independent responsibilities.

Final migration verification (2026-09-27): the workspace bootstrap mock now includes its organization request, and the documented project Collaboration page loads assignments, mentions, and share links through a selection-safe data hook. Experiment detail now treats an unloaded result collection as empty instead of dereferencing null. Seven targeted Chromium customer-flow E2E scenarios passed. Frontend and TypeScript SDK typechecks, in-memory Python compilation for 147 backend/SDK modules, Vite production build (1,209 modules), and whitespace checks passed. No unit tests were written or run. A separate full legacy E2E run was stopped after its first three 30-second failures: the older collaboration spec targets removed table markup and a `trace_id_` value, while dataset specs expect the obsolete `Golden Dataset`/`Add Example` UI rather than the current seeded `Refund QA`/`Add Eval Row` flow. SQLAlchemy is unavailable in the bundled Python runtime, so generated AQL aggregation SQL was syntax-compiled but not executed against a database; the OLAP engine choice remains open.
