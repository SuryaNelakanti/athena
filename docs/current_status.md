# Athena - Current Status (2026-01-05)

This file summarizes what is implemented in the current repo vs. the intended direction in `docs/project-context.md`, and proposes an action plan for the agent-native wedge (session-first runs + graph debugging + trajectory-aware eval + closed-loop automation).

---

## What exists today (repo reality)

### Frontend (Athena app)
- Hash-based router with primary pages: Dashboard, Agent Runs, Logs (with Trace detail), Review, Collaboration, Datasets, Experiments, Playgrounds, Settings (`frontend/src/App.tsx`, `frontend/src/design/layout/Layout.tsx`).
- OwlWidget is mounted globally and appears on every screen (`frontend/src/App.tsx`, `frontend/src/design/components/OwlWidget.tsx`).

### Auth (current state)
- No end-user auth/RBAC yet; the backend seeds a default organization + project for local/dev flows (`backend/app/main.py`).

### OwlWidget (in-app assistant)
- Page-aware context (route + params + project) is sent to the backend for system prompt construction.
- Playbooks: AQL authoring, prompt optimization, scorer draft, dataset ideas, experiment summary, docs search.
- Uses server-managed Owl chat endpoint (`POST /owl/chat`), which auto-selects a model based on configured provider keys and returns `trace_id`/`span_id` for correlation.
- Uses `POST /owl/search-docs` for lightweight docs search across repo markdown; `GET /owl/available-model` reports active provider/model.

### Proxy (unified inference)
- `POST /v1/chat/completions` supports streaming and returns trace context headers (`X-Athena-Trace-ID`, `X-Athena-Span-ID`), and accepts parent context (`X-Athena-Trace-ID`, `X-Athena-Parent-Span-ID`) (`backend/app/routers/proxy.py`).
- Cache endpoints exist (`/v1/cache/*`) (`backend/app/routers/proxy.py`).

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
- Data models: `AgentSessionModel`, `AgentRunModel`, `AgentSessionEventModel`, `AgentSessionAnnotationModel`, `AgentSessionIngestModel` (`backend/app/models.py`).
- Session APIs include run summaries (run_count, error_count, last_status, last_run_id) for list views (`backend/app/routers/sessions.py`).
- Demo seed script includes agent runs (run groups), runs, timeline events, and annotations (`backend/scripts/seed_story.py`).
- Session/run metadata stored in DB `metadata` columns via `metadata_` model fields to avoid SQLModel reserved names (`backend/app/models.py`).

### Agent-native UX (frontend)
- Agent Runs list + run group detail views with runs, timeline, and annotations (`frontend/src/design/pages/SessionList.tsx`, `frontend/src/design/pages/SessionDetail.tsx`).
- Run detail view with graph renderer + node inspector (`frontend/src/design/pages/RunDetail.tsx`, `frontend/src/design/components/RunGraph.tsx`).
- Agent Runs surface labels and summaries (run counts, error counts, last status) to support triage (`frontend/src/design/pages/SessionList.tsx`, `frontend/src/design/pages/SessionDetail.tsx`).

### Datasets, review, experiments, and query
- Datasets: CRUD + versioned dataset rows (`backend/app/routers/datasets.py`).
- Review queue: `review_item` model and API (`backend/app/models.py`, `backend/app/routers/reviews.py`).
- Experiments: experiments, versions, runs, results (`backend/app/routers/experiments.py`).
- Experiment result rows can generate share permalinks (`frontend/src/design/pages/ExperimentDetail.tsx`).
- AQL: query endpoint exists (`backend/app/routers/aql.py`) and Dashboard includes monitor charts (`backend/app/routers/charts.py`, `frontend/src/design/pages/Dashboard.tsx`).

### Collaboration primitives (API-level)
- Attachments, assignments, mentions, share links, views, environments routers exist (`backend/app/routers/*`).
- Logs and traces generate share permalinks, resolved via the `/share-links` route (`frontend/src/design/pages/LogTable.tsx`, `frontend/src/design/pages/TraceDetail.tsx`, `frontend/src/App.tsx`).

### MCP server
- MCP router exists in backend and local setup docs are present, including smoke test steps (`backend/app/routers/mcp.py`, `docs/mcp.md`, `docs/mcp-ide-setup.md`).

---

## What is missing (agent-native wedge gaps)

These are the biggest deltas between the additive wedge plan and the current codebase:

- OwlWidget context is sent as route params but still lacks session/run summaries or graph context.
- Deep tool/RAG instrumentation: no formal tool-call schema validation or retrieval node/event type in the ingest pipeline.
- Trajectory-aware evaluation: no session-level eval record and scorers for tool correctness/path efficiency (separate from experiment scoring).
- Closed-loop automation: no rules engine, triggers/actions, or failure inbox produced by rules.
- Replay + diff: no deterministic replay harness or run-vs-run graph diff.

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
1) Rules engine v1: triggers -> actions, evaluated on ingest + schedule.
2) Failure queue (“Review Inbox”) generated by rules, with resolve/reassign/promote flows.
3) Auto-curation v1: dedup + clustering + sampling; “Suggested Dataset” view; approve to add dataset rows with provenance.

### Phase A6 - Replay + compare
1) Deterministic replay harness (freeze tool results); link rerun to original.
2) Run-vs-run graph diff (nodes added/removed/changed; key metric deltas).

---

## Recommended “next commit”

Start with Phase A3:
- Add tool-call schema enforcement + retrieval event ingestion.
- Surface reasoning/content separation in run node detail panels.

That builds on the session/run UI to deepen agent realism and scoring.
