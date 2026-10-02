# Athena - AI Operations Platform

## What is Athena?

Athena is an **AI proxy + observability + evaluation platform** with a closed-loop workflow (Logs → Dataset → Experiment) and MCP IDE integration. Debug agent failures fast with session-first debugging, graph views, and semantic evaluation.

### The Problem Athena Solves

Teams can usually do either:
- Ship LLM features (inference), or
- Run offline evals (quality)

...but they struggle to move data between production and development quickly. **Athena's moat is frictionless movement of data across the lifecycle.**

---

## Core Capabilities

### Universal Proxy (Inference)

One integration across all LLM providers:

| Feature | Description |
|---------|-------------|
| Provider-agnostic | OpenAI, Anthropic, Gemini via unified API |
| SSE Streaming | Content + reasoning delta channels |
| Metrics capture | Tokens, latency, cost per request |
| Context propagation | Trace/span linking across calls |
| Fail-open design | Fallback to direct provider if proxy unavailable |
| Caching | Optional with explicit bypass controls |

### Agent-Native Observability

Session-first data model for debugging agent runs:

| Feature | Description |
|---------|-------------|
| Sessions & Runs | Group multiple agent executions, stable timeline |
| Graph debugging | DAG view of spans (branches, retries, tool calls) |
| Trace/span trees | Hierarchical view of request execution |
| Permalinks | Share exact bad runs for review and collaboration |
| Tool call introspection | Args, results, status, duration per tool call |
| Reasoning separation | Reasoning content stored/rendered separately |

### Semantic Evaluation

Semantic-first scoring philosophy — GenAI outputs are non-deterministic:

| Scorer Type | Use Case | Priority |
|-------------|----------|----------|
| LLM Judge | Semantic evaluation of quality/correctness | Primary |
| Criteria Checklist | Did output meet specific requirements? | Primary |
| Tool Correctness | Right tools, right parameters, right sequence? | Secondary |
| Outcome/Decision | Was the final action correct? | Secondary |
| Deterministic | Exact match, regex, contains (for regression) | Tertiary |

### IDE Integration (MCP Server)

Connect your IDE agent directly to Athena:

- Search documentation from your editor
- Run AQL queries on logs/traces
- Fetch experiment summaries
- Generate permalinks to share with team

Supports: Cursor, VS Code, Claude Code

### Data Isolation

Optional customer-owned data plane:
- Raw telemetry never leaves your environment
- Deploy in your cloud (AWS, GCP, Azure)
- Athena provides intelligence; you keep the data

---

## The Closed-Loop Workflow

```
LOGS → DATASET → EXPERIMENT → LOGS → ...
```

1. **Capture** real production failures
2. **Curate** examples into versioned datasets
3. **Run evals** with semantic scorers
4. **Monitor drift** in production
5. Repeat

---

## Limitations & Edge Cases

**When Athena might NOT be the right fit:**

- **Simple logging only**: If you only need request logging without evaluation or the closed-loop workflow, simpler tools exist
- **Non-agent workloads**: Athena is optimized for agentic AI with tool calls, retries, and branching — single-turn completion APIs get less value
- **On-prem without cloud**: Currently requires internet access for control plane; fully air-gapped deployments not yet supported
- **Foundation model training**: Athena is for inference observability and eval, not training infrastructure

---

## Pricing

Currently in early access. [Book a demo](https://athena.dev/) to discuss pricing for your use case.

---

## Getting Started

1. Sign up for early access
2. Instrument your app with the SDK (Python or TypeScript)
3. Point inference calls through the Athena Proxy
4. View logs, traces, and sessions in the dashboard
5. Promote failures into datasets
6. Run experiments with semantic scorers

**Time to value: < 30 minutes**

---

## Links

- [Documentation](https://athena.dev/docs/)
- [API Reference](https://athena.dev/api/)
- [Security](https://athena.dev/security)
- [Privacy Policy](https://athena.dev/privacy)

© 2026 Athena AI
