# Athena - Project Context

This document consolidates `Agents.md` and `agents-additive.md` into a single reference for the Athena product definition, core concepts, architecture, and phased execution plans.

---

## 0. One-line product definition

Athena is an AI proxy + observability + evaluation platform with a closed-loop workflow (Logs -> Dataset -> Experiment) and an MCP server that lets IDE agents query and act on AI telemetry and eval artifacts.

---

## 1. Why Athena exists

Teams can usually do either:
- ship LLM features (inference), or
- run offline evals (quality),

...but they struggle to move data between production and development quickly and safely. Athena's moat is frictionless movement of data across the lifecycle.

---

## 2. Personas and jobs-to-be-done

### 2.1 AI Engineer / Applied ML
- Ship prompts/agents across providers without rewriting integration code.
- Debug failures via traces (nested tool calls, retries, structured errors).
- Improve quality via evals; compare models/prompt versions.

### 2.2 Product Manager / QA
- Review real production outputs; label failures; create/curate datasets.
- Track metrics (quality, latency, cost) over time.
- Share permalinks to "the exact bad example" for discussion.

### 2.3 Platform / Infra
- Centralize provider credentials, routing, rate limits.
- Enforce access control, environment separation, data-plane isolation.
- Ensure the proxy is reliable (fail-open).

---

## 3. Core objects (mental model)

Athena is organized around Organizations -> Projects. Projects contain:

- Logs: individual production/staging calls (inputs/outputs/metadata/metrics/errors).
- Traces: end-to-end request trees.
- Spans: steps within a trace (LLM call, tool call, DB query, etc.).
- Sessions: a session groups multiple agent runs and provides a canonical timeline (messages, tool calls, model calls, retries).
- Runs / AgentRuns: a single execution within a session (typically one trace tree) with graph/debug views.
- Datasets: versioned JSON-record collections used for eval and analysis.
- Experiments: evaluation runs over datasets with tasks + scorers.
- Playgrounds: interactive workspace to compare prompts/models/scorers/datasets.
- Functions: user-defined code assets used as scorers or callable tools.
- Views: saved table configurations (filters/sorts/columns) for tables.
- Attachments: binary artifacts (images/audio/video/PDF/JSON blobs), internal or external.
- Environments: lifecycle lanes (dev/staging/prod) for pinning prompt versions.
- Assignments & mentions: lightweight workflow state tied to a row/object.
- Share links: permalinks to objects/rows for collaboration.
- Query: AQL (Athena Query Language) to filter/aggregate logs, spans, traces, and experiment outputs.
- Automations: trigger/action rules that turn failures into review + datasets + experiments.
- MCP server: IDE agent gateway exposing tools over HTTP MCP + OAuth.

---

## 4. Architecture (high-level)

Athena is split into:

### 4.1 Control Plane (Athena-managed)
- Auth, organizations/projects, billing, feature flags.
- SDK distribution + configuration.
- MCP server (hosted) and OAuth discovery.
- Provider registry and org-level provider enablement (for Proxy, Playgrounds, and OwlWidget).

### 4.2 Data Plane (customer-owned, optional but first-class)
- API layer + database deployed in the customer's cloud environment.
- Stores sensitive logs/telemetry so data never leaves the customer environment.

This architecture supports privacy-sensitive production logs at scale and enables self-hosted / hybrid deployments.

---

## 5. Pillar A - Athena AI Proxy (Control Plane wedge)

### 5.1 Problem it solves
- Unified interface across providers (schema differences, model naming, auth).
- Centralized provider keys + rate limits.
- Consistent streaming format and consistent reasoning-model capture.
- Optional caching for deterministic requests.

### 5.2 Proxy responsibilities (must-have)
1. Unified inference API across providers
   - Support both request/response calls and streaming calls.
2. Streaming over Server-Sent Events (SSE)
   - Stream content incrementally.
   - Also stream reasoning_delta incrementally for reasoning-capable models.
3. Reasoning model normalization
   - Persist reasoning content separately from user-visible content.
   - Store/stream a distinct reasoning channel (do not mix into content).
4. Request context propagation
   - Allow nesting traces/spans across downstream calls via trace + parent span context.
   - Accept `X-Athena-Trace-ID` and `X-Athena-Parent-Span-ID` headers (or `trace_id`/`parent_span_id` in the request body).
   - Return `X-Athena-Trace-ID` and `X-Athena-Span-ID` headers plus `trace_id`/`span_id` in the response for correlation.
   - `trace_group_id` groups related traces (session-style); defaults to the current trace id or parent trace id when not provided.
5. Optional caching
   - Allow explicit cache enablement and explicit bypass.
   - Support end-to-end encryption for cache values (AES-GCM) so Athena cannot read cached content.
6. Fail-open design
   - If proxy is unreachable, SDK can fall back to direct provider calls (configurable).
7. Metrics capture
   - Tokens, cost, latency, model/provider, cache hit/miss.

### 5.3 Proxy non-goals (v1)
- Building a provider marketplace.
- Advanced PII redaction rules (plan as a later module).
- On-proxy fine-tuning or training.

---

## 6. Pillar B - Observability (Data Plane)

### 6.1 Tracing model
- Trace: root request; includes overall timing, metadata, and linked logs.
- Span: hierarchical steps; includes inputs/outputs, tool args/results, errors.
- Log row: a canonical record of a model call (or high-level generation event).

### 6.2 UI requirements
1. Logs table
   - Filter/sort, custom columns, views.
   - Per-row expand showing input/output/metadata/metrics/errors.
2. Trace detail view
   - Tree view of nested spans.
   - Clear separation of reasoning vs content in rendering.
3. Trace comparison
   - Side-by-side compare of two runs for the same row (especially from playground/experiment).
4. Monitor dashboards
   - Time-series charts for cost/tokens/latency/errors/quality scores.
5. Human review
   - Queue for manually scoring/labeling outputs.
   - Ability to push reviewed rows into datasets (closing the loop).

### 6.3 Collaboration requirements
- Assignments & mentions
  - Assign a log row / dataset row / experiment row to a user.
  - Mention users, notify them, and track resolution state.
- Share links
  - Generate permalinks to specific objects and even specific rows.

### 6.4 Agent-native observability additions (from `agents-additive.md`)
- Session-first data model: Sessions group multiple runs and expose a stable, ordered timeline.
- Graph debugging view: derive a DAG from spans (branch markers, retries, tool calls) with node panels and causal breadcrumbs.
- Deep instrumentation: tool call schema capture/validation, retrieval/RAG event types, and strict reasoning/content separation across storage + API + UI.

---

## 7. Pillar C - Evaluation (closed-loop workflow)

### 7.1 Datasets

Datasets are:
- Integrated with the platform (usable in eval, playground, and logging).
- Versioned (every insert/update/delete is versioned; evals can pin a dataset version).
- Scalable (warehouse-backed).
- Secure (in data-plane deployments, data stays in customer environment).

Dataset row schema:
- input: inputs to reproduce an example.
- expected (optional): output or reference (not necessarily ground truth).
- meta (optional): key/value attributes for filtering/grouping and provenance.
- row_kind: `eval` or `resource`.
- eval_label (optional): `gold` or `anti_pattern`.
- example_type: `gold` or `anti_pattern` (human labeling convention).
- source_trace_id (optional): trace id if promoted from production.
- logical_id: stable id that groups revisions of the same row.
- version: revision number for the logical row.
- dataset_version: dataset version when this revision was added.
- is_deleted: tombstone marker for soft deletes.

Support:
- Insert/update/delete/flush.
- Filter/sort/limit via query clauses (AQL/BTQL-compatible filtering semantics).
- Multimodal via URLs/base64/attachments/external attachments.

### 7.2 Experiments & scoring philosophy

An experiment is:
- Data (dataset rows with input + expected behaviors).
- Task (the function/prompt/agent being evaluated).
- Scorers (evaluation functions that assess output quality).

#### 7.2.1 Semantic-first scoring (core principle)

GenAI outputs are non-deterministic. The same prompt can produce semantically equivalent but textually different outputs. Traditional string-matching scorers (exact match, regex) are insufficient for most real-world AI evaluation.

Athena's scoring philosophy prioritizes semantic evaluation over string matching:

| Priority | Scorer Type | Use Case |
|----------|-------------|----------|
| Primary | LLM Judge | Semantic evaluation of quality, correctness, tone |
| Primary | Criteria-Based | Checklist of specific requirements (did it cite policy? polite tone?) |
| Secondary | Outcome/Decision Match | Was the final decision/action correct? |
| Secondary | Tool Correctness | For agents: were the right tools called with correct parameters? |
| Tertiary | Deterministic | Regression testing, factual Q&A, code presence checks |

#### 7.2.2 Scorer types (required)

1. LLM Judge (default)
   - Uses an LLM to semantically evaluate output quality.
   - User-configurable criteria (e.g., "accuracy, helpfulness, policy compliance").
   - Returns normalized score (0-1) with optional reasoning.
   - Supports custom evaluation prompts.

2. Criteria-based scorer
   - User defines a checklist of requirements (each yes/no).
   - Returns aggregate score + per-criterion breakdown.

3. Outcome/decision scorer
   - Evaluates whether the final decision/outcome was correct.
   - Ignores the path and focuses on the result.

4. Tool correctness scorer
   - Evaluates tool selection, parameter accuracy, and call sequence.
   - Returns breakdown by tool call.

5. Deterministic scorers (secondary)
   - `exact_match`: normalized string equality (for factual Q&A, regression).
   - `contains`: checks if expected substring appears in output.
   - `regex`: pattern matching for structured outputs.
   - `anti_pattern`: ensures output doesn't resemble known-bad patterns.

#### 7.2.3 Experiment capabilities (required)

Must support:
- Batch execution with concurrency controls.
- Persist per-row outputs + per-row scores + aggregate summaries.
- Multi-scorer per experiment (LLM Judge + Criteria + Tool Correctness together).
- Weighted score aggregation (configure importance of each scorer).
- Compare against baselines (version vs version).
- Online scoring for production logs (near-real-time drift signals).
- Cost tracking per run (especially for LLM Judge costs).

### 7.3 Playgrounds

Playgrounds are an editor-like workspace to:
- Tune prompts, models, scorers, datasets.
- Run evaluations side-by-side.
- View traces and diff outputs.
- Run thousands of dataset rows in-browser (with a UI timeout; long runs are programmatic).

### 7.4 Trajectory-aware evaluation additions (from `agents-additive.md`)
- Session-level eval records: evaluate overall session reliability, not only final text.
- Additional agent scorers: path efficiency (loops/redundant calls), richer tool correctness, and auditable judge runs (prompt/model/token/cost recorded).
- UI integration: highlight failing nodes directly in the run graph.

---

## 8. Query - AQL (Athena Query Language)

### 8.1 Purpose

AQL is a SQL-like query interface for:
- production logs
- spans
- traces
- experiment outputs

### 8.2 Shapes

AQL must support multiple query shapes (logical tables), such as:
- `project_logs(project_id)`
- `project_spans(project_id)`
- `project_traces(project_id)`
- `experiment_logs(experiment_id)`
- attribute sub-shapes (e.g., `span_attributes(...)`)

### 8.3 Clauses (minimum)
- `from`
- `select`
- `filter`
- `dimensions` (group-by)
- `measures` (aggregations)
- `sort`
- `limit`
- Common functions: `now()`, `day()`, `hour()`, `percentile()`, etc.
- Conditions: `IN`, `IS NULL`, nested conditionals (`? :`), regex/match-like operators.

### 8.4 Implementation constraint (explicit decision)

Do not build a bespoke OLAP engine:
- Use a columnar OLAP store (e.g., ClickHouse) or embedded engine (e.g., DuckDB).
- Implement AQL as a front-end syntax + transpiler to backend SQL.
- Keep shape resolution and field mapping at the API layer.

---

## 9. OwlWidget (in-app assistant)

Athena ships an in-product assistant ("Owl") surfaced as `OwlWidget`, which appears on every screen for fast, page-aware help.

In this codebase, OwlWidget:
- Injects per-page context (route, params, project) into the system prompt.
- Provides playbooks: AQL Author, Prompt Optimizer, Scorer Draft, Dataset Ideas, Experiment Summary, Docs Search.
- Calls the Proxy chat endpoint (`/v1/chat/completions`) and includes `trace_id` for correlation.
- Uses `POST /owl/search-docs` for simple in-repo docs search.

---

## 10. MCP server (IDE agent integration)

### 10.1 What it is

Athena provides an HTTP MCP server that gives IDE agents direct access to Athena data and documentation, secured via OAuth 2.0 with PKCE.

Hosted:
- `https://api.athena.dev/mcp` (example)

Self-hosted:
- `<YOUR_API_URL>/mcp`

### 10.2 MCP tools (must-have v1)
- `search_docs`: semantic documentation search
- `resolve_object`: map object names <-> IDs, and fetch permalinks
- `list_recent_objects`: recent projects/experiments/datasets/functions/prompts
- `infer_schema`: infer schema + sample values for a dataset/experiment/logs query
- `aql_query`: execute AQL queries (logs/spans/traces/experiments)
- `summarize_experiment`: aggregated scores/cost/latency summaries
- `generate_permalink`: create shareable links for objects/rows

---

## 11. Security, privacy, and access control

### 11.1 Access control model
- Organization-level permissions.
- Object-scoped permissions (projects, datasets, experiments, logs, prompts, playgrounds).
- Permission groups (customizable).
- Service accounts + service tokens.

Manage Access is a super-user permission; treat it as sensitive.

### 11.2 Self-hosting and data isolation
- Data plane can run in customer cloud so sensitive raw logs never traverse Athena-managed infrastructure.
- Endpoints can be placed behind VPN.

### 11.3 Attachments
- Support uploading binary data as attachments; store in object store tied to org.
- External attachments are supported (e.g., `s3://...`), with client-controlled access.

---

## 12. Product surfaces (UI map)

### 12.1 Current navigation (as implemented in this repo)
- Projects
  - Dashboard (includes monitor charts)
  - Logs
  - Review
  - Collaboration
  - Datasets
  - Experiments
  - Playgrounds
  - Settings
- Global
  - OwlWidget (page-aware assistant)

### 12.2 Planned surfaces (roadmap)
- Sessions (agent-native)
- Runs (graph debugging)
- Functions (scorers/tools)
- Automations
- Context: views, attachments, environments, assignments & mentions, share links

---

## 13. Phased execution plan (consolidated)

This section includes both:
- the core platform phases from `Agents.md`, and
- the agent-native additive plan (with acceptance criteria) from `agents-additive.md`.

### 13.1 Core platform plan (from `Agents.md`)

Each task is a logically atomic unit that only adds on top of the previous work.

#### Phase 0 - Foundations (product skeleton)
0.1 Define canonical object model + IDs (org/project/log/trace/span/dataset/experiment/playground/function/view/attachment/environment/assignment/sharelink)
0.2 Establish deployment topology: Control Plane + optional Data Plane
0.3 Establish auth primitives: users, sessions, service accounts, service tokens
0.4 Set up audit-log framework (record "who did what" for future enterprise needs)

#### Phase 1 - Data ingestion + baseline observability
1.1 Implement Project Logs ingestion API (single call logging + batched logging)
1.2 Implement Trace/Span ingestion API (tree structure, parent pointers)
1.3 Persist metrics schema (tokens, latency, cost, model/provider, error)
1.4 Build Logs Table UI (filter/sort/basic columns)
1.5 Build Trace Detail UI (tree viewer + per-span panels)
1.6 Implement Views (saved filters/sorts/columns) for Logs and Datasets

#### Phase 2 - Athena AI Proxy (adoption wedge)
2.1 Define unified proxy request/response schema (provider-agnostic)
2.2 Build provider adapters (at least 2 vendors) + model registry
2.3 Implement streaming SSE format (content + reasoning_delta channels)
2.4 Implement reasoning capture pipeline (store reasoning separately, render in UI)
2.5 Implement trace context propagation header (parent-child linking)
2.6 Implement proxy metrics capture + attach to logs/spans
2.7 Implement fail-open client behavior (configurable)
2.8 Implement caching controls + cache bypass
2.9 Implement E2E encrypted cache mode (AES-GCM; key provided by client)

#### Phase 3 - Datasets + Review loop (close the flywheel)
3.1 Implement Datasets API (create/read/list) with versioned writes
3.2 Implement dataset row schema enforcement (input/expected/metadata)
3.3 Implement dataset CRUD: insert/update/delete + flush semantics
3.4 Implement attachments integration for dataset rows (internal + external)
3.5 Build Dataset UI (table + row detail)
3.6 Implement Review UI (human scoring, labels, notes)
3.7 Implement "Add to dataset" from Logs/Review (production -> dataset)
3.8 Implement Assignments & mentions on rows/objects
3.9 Implement Share links (permalink generation for objects/rows)

#### Phase 4 - Experiments + scorers/functions
4.1 Implement Functions registry (store function metadata + versions)
4.2 Implement scorer execution model (code scorer + LLM-judge scorer)
4.3 Implement Experiment runner (dataset x task x scorers)
4.4 Persist per-row outputs/scores + aggregate summaries
4.5 Build Experiment UI (results table + aggregates + compare baseline)
4.6 Implement Online scoring for production logs (near-real-time signals)

#### Phase 5 - AQL (Query) + Monitor dashboards
5.1 Implement AQL shape resolver for logs/spans/traces/experiment outputs
5.2 Implement AQL transpiler to backend SQL (choose OLAP engine)
5.3 Build AQL editor + results table
5.4 Build Monitor dashboards powered by AQL (tokens/cost/latency/errors/scores)
5.5 Enable custom charts (saved queries + visualization configs)

#### Phase 6 - Playgrounds (interactive evaluation workspace)
6.1 Implement Playground object model (tasks, datasets, scorers, configs)
6.2 Build Playground UI (editor-like; side-by-side runs)
6.3 Implement trace viewer + diff mode in playground results
6.4 Implement "snapshot to experiment" (convert playground run to experiment)
6.5 Enforce UI run timeout; route long runs to programmatic runner

#### Phase 7 - OwlWidget assistant + MCP server
7.1 Implement OwlWidget global assistant (per-page context)
7.2 Implement Owl playbooks: AQL author, prompt optimize, scorer draft, dataset ideas, experiment summary, docs search
7.3 Implement documentation search index for Owl + MCP
7.4 Implement MCP server endpoints (HTTP MCP + OAuth2 PKCE)
7.5 Implement MCP tools: search_docs, resolve_object, list_recent_objects, infer_schema, aql_query, summarize_experiment, generate_permalink
7.6 Ship tool-specific setup docs (Cursor/VS Code/Claude Code/etc.)

#### Phase 8 - Enterprise hardening (optional, after PMF)
8.1 SSO (SAML/OIDC) + enforced org policies
8.2 Data-plane self-hosting automation (Terraform/CloudFormation)
8.3 Advanced RBAC templates and group governance
8.4 Data retention policies + export APIs
8.5 Compliance hardening (SOC2 posture; audit log UX)

#### Phase 9 - Agentic Ops (Autopilot / Guardian)
9.1 Define background agent framework: schedules, triggers, permissions, audit trail, run limits
9.2 Implement anomaly detection for quality/cost/latency/error drift with alerting + assignments
9.3 Add automated dataset curation suggestions from logs (edge cases, low scores)
9.4 Enable continuous eval triggers (post-deploy, scheduled, or drift-based)
9.5 Provide remediation suggestions with human approval (prompt/model routing, tool suggestions)
9.6 Add governance controls: opt-in policies, explainability, rate limits, rollback

### 13.2 Agent-native additive plan (from `agents-additive.md`)

Goal: ship the winning wedge first:
- Session-first agent runs + graph debugging
- Trajectory-aware eval
- Automation that turns failures into datasets + review + experiments

Each task below is additive (no "go back and redo"), with crisp acceptance criteria.

#### Additive Phase A0 - Productization baseline (so you can sell while building)
- A0.1 Hosted MVP shell (auth + project + basic navigation)
  - Adds: hosted login, org/project selection, minimal UI chrome for new surfaces.
  - Acceptance:
    - New org + project creation works end-to-end.
    - One user can create a project and see "Runs / Sessions / Experiments / Datasets / Automations" tabs (even if empty).
- A0.2 Telemetry ingestion contract freeze (v0)
  - Adds: stable API schema for sessions/runs/spans/tool calls (versioned).
  - Acceptance:
    - `POST /ingest` accepts a session payload with nested spans + tool calls.
    - Stored data can round-trip (API -> DB -> API) without loss.
    - Schema version recorded per event.

#### Additive Phase A1 - Agent-native data model (session-first)
- A1.1 Introduce Session / AgentRun objects
  - Adds: first-class `session_id`, `run_id`, `agent_name`, `env`, `version`.
  - Acceptance:
    - API: `GET /sessions`, `GET /sessions/{id}`, `GET /runs/{id}`.
    - A session groups multiple runs; a run has a trace/spans tree.
    - Basic filters: by time, env, agent_name.
- A1.2 Session timeline materialization
  - Adds: canonical ordered event stream for a session (messages, model calls, tools, retries).
  - Acceptance:
    - `GET /sessions/{id}/timeline` returns ordered events with timestamps + type.
    - Timeline is stable across pagination and deterministic ordering rules documented.
- A1.3 Session annotations (human)
  - Adds: labels, notes, severity, owner, status (open/resolved).
  - Acceptance:
    - UI: annotate a session; see badge in list.
    - API supports create/update/list annotations.
    - Audit log includes "who annotated what".

#### Additive Phase A2 - Agent graph debugging UI (the "aha" moment)
- A2.1 Graph model (DAG) derived from spans
  - Adds: graph abstraction: nodes/edges, branch markers, retries, tool calls.
  - Acceptance:
    - `GET /runs/{id}/graph` returns nodes/edges + layout hints.
    - Node types include `llm_call`, `tool_call`, `retrieval`, `guardrail`, `retry`.
- A2.2 Graph renderer v1
  - Adds: visual graph viewer in UI for a run.
  - Acceptance:
    - Can open a run and see graph with clickable nodes.
    - Clicking a node shows structured panel (inputs/outputs/metadata/errors).
- A2.3 Branch + retry visualization
  - Adds: clear differentiation of retries, fallbacks, and branches.
  - Acceptance:
    - UI shows retry chains and branch splits distinctly.
    - Run with retries is visually comprehensible in <10 seconds.
- A2.4 Why breadcrumbs (causal context)
  - Adds: trace-back view: "what led to this node".
  - Acceptance:
    - For any node, UI can show the preceding causal chain + key state deltas.
    - Works for `tool_call` and `llm_call` nodes.

#### Additive Phase A3 - RAG + tooling deep instrumentation (agent realism)
- A3.1 Tool call schema enforcement
  - Adds: tool arg/result JSON schema capture + validation errors.
  - Acceptance:
    - Tool calls store `tool_name`, `args`, `result`, `status`, `duration_ms`.
    - Validation errors visible in node panel.
- A3.2 Retrieval/RAG event type
  - Adds: capture retrieval query, top-k docs, scores, doc IDs, citations used.
  - Acceptance:
    - Ingest supports retrieval nodes; UI shows retrieved docs list.
    - Docs are linkable (attachments/external URLs).
- A3.3 Reasoning/content separation everywhere
  - Adds: consistent separation in storage + API + UI render.
  - Acceptance:
    - Reasoning never mixes into user-visible content in UI.
    - API returns content and reasoning separately for reasoning-capable models.

#### Additive Phase A4 - Trajectory-aware evaluation (the "agent reliability" moat)
- A4.1 Evaluations v2: session-level eval record
  - Adds: `session_eval` entity: overall scores + rubric + summary.
  - Acceptance:
    - One session can have multiple eval runs (versioned).
    - UI shows overall score + breakdown.
- A4.2 Scorer: tool correctness v1
  - Adds: checks: tool chosen, args validity, sequence constraints.
  - Acceptance:
    - Given a run, scorer outputs pass/fail + per-call breakdown.
    - UI highlights failing nodes in graph.
- A4.3 Scorer: path efficiency v1
  - Adds: detects loops, redundant calls, excessive retries, wasted tokens.
  - Acceptance:
    - Produces numeric score + reasons list.
    - UI lists top inefficiencies with node links.
- A4.4 Scorer: outcome/decision v1 (lightweight)
  - Adds: final outcome correctness (task-dependent).
  - Acceptance:
    - Supports pluggable task types (at least 2: classification, extract-structure).
    - Produces deterministic score if expected output provided.
- A4.5 Judge scorer (LLM) constrained + auditable
  - Adds: LLM judge with rubric, cost tracking, prompt versioning.
  - Acceptance:
    - Every judge run stores prompt template + model + token/cost.
    - Judge output includes score + short rationale.
    - Can re-run judge with a different model and compare.

#### Additive Phase A5 - Closed-loop automation (background agents, but shippable)
- A5.1 Rules engine v1 (triggers -> actions)
  - Adds: automation definitions stored per project.
  - Acceptance:
    - UI: create a rule in <2 minutes.
    - Rule supports at least 4 triggers + 4 actions (see below).
    - Rules evaluated on ingest + on schedule.
  - Triggers v1:
    - eval score below threshold
    - error spike (rate)
    - cost spike
    - latency regression
  - Actions v1:
    - auto-tag session/run
    - create review task (assignment)
    - promote to dataset queue
    - webhook notify (Slack later)
- A5.2 Failure queue (Review Inbox)
  - Adds: a queue of sessions needing review generated by rules.
  - Acceptance:
    - Sessions appear with reason + trigger metadata.
    - Reviewer can resolve, reassign, or promote to dataset.
- A5.3 Auto-curation v1 (production -> dataset suggestions)
  - Adds: dedup + clustering + sampling so the queue is not garbage.
  - Acceptance:
    - Suggested Dataset view shows clustered failures.
    - Approve adds rows to a dataset with provenance links to sessions.

#### Additive Phase A6 - Replay + compare (turn debugging into engineering)
- A6.1 Session replay harness v1
  - Adds: replay with frozen tool results (deterministic replay).
  - Acceptance:
    - Re-run generates a new run linked to original.
    - Graph diff highlights changed nodes.
- A6.2 Graph diff v1 (run vs run)
  - Adds: compare trajectory changes, not just text diffs.
  - Acceptance:
    - UI shows nodes added/removed/changed + key metric deltas.
    - Works even when output text is similar but path differs.

#### Additive Phase A7 - Enterprise & adoption blockers (sell bigger, faster)
- A7.1 Corporate proxy + restricted egress compatibility
  - Adds: data plane egress controls + proxy config.
  - Acceptance:
    - Can run behind a corp proxy and still reach object storage + model providers.
    - Documented deployment recipe works in a clean env.
- A7.2 Hybrid deployment pack v1 (Terraform/Helm)
  - Adds: one-click-ish deployment for data plane.
  - Acceptance:
    - New customer can deploy data plane in <1 hour following docs.
    - Health checks + upgrade path documented.
- A7.3 Cost attribution + multi-currency display
  - Adds: cost breakdown per session/run + currency selection.
  - Acceptance:
    - UI shows per-session cost + rollups per project/env/model.
    - Currency conversion works with configurable rate source.

#### Additive Phase A8 - GTM readiness (convert pilots into paid)
- A8.1 Time-to-value in 30 minutes onboarding
  - Adds: guided setup + sample app + first dashboard.
  - Acceptance:
    - A new user can instrument a sample agent and see: session list, run graph, at least one eval score, one automation firing.
- A8.2 Self-serve usage & pricing surface (even if simple)
  - Adds: metering dashboard + plan gates.
  - Acceptance:
    - Usage visible: ingests, retention, eval tokens, storage.
    - Plan limits enforceable (soft limit OK initially).

### 13.3 Mapping (additive phases -> core platform phases)

This is an approximate mapping to reconcile the two plans:

| Additive Phase | Primary focus | Overlaps most with core phases |
|---------------|---------------|--------------------------------|
| A0 | Product shell + ingestion contract | 0, 1 |
| A1 | Session-first data model + timeline | 1 |
| A2 | Graph debugging UI | 1 (and UI work in 6) |
| A3 | Tool/RAG instrumentation + reasoning separation | 1, 2 |
| A4 | Trajectory-aware evaluation + scorers | 4 |
| A5 | Closed-loop automation + review inbox | 3, 9 |
| A6 | Replay + graph diff | 6 (and some 1) |
| A7 | Enterprise/hybrid + cost attribution | 8 |
| A8 | Onboarding + pricing surface | 0 (productization), plus go-to-market work |

---

## 14. MVP definition (ship criteria)

Athena v1 is shippable when:
- A user can instrument an app in <30 minutes using the Athena Proxy + SDK.
- They can see logs + traces (including nested spans) in the UI.
- They can review outputs and push rows into a dataset.
- They can run an experiment over that dataset, compute scorers, and compare runs.
- They can author AQL queries for token/cost/quality and create a monitor chart.
- They can share a permalink to a specific row/trace/experiment result.
- They can connect an IDE tool via MCP and run: docs search, object resolution, AQL query, experiment summary.

---

## 15. Explicit naming conventions (compat + clarity)

- AQL is the user-facing query language (Athena Query Language).
- Proxy is the inference gateway.
- Data plane means customer-deployed ingestion + storage.
- Control plane means Athena-managed auth/billing/MCP.

---

## 16. Open questions (engineering planning)

- Which OLAP engine for AQL v1 (ClickHouse vs DuckDB vs other)?
- Minimum provider set for Proxy v1 (2 providers + OpenAI-style responses adapter)?
- What is the default retention policy for raw logs in hosted mode?
- Do we ship remote evals in v1 or v2?
