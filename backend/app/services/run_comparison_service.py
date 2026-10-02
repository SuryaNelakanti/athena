from typing import Any, Sequence

from app.models import AgentRunModel, SpanModel
from app.schemas.sessions import RunCompareResponse


def _span_key(span: SpanModel) -> str:
    return f"{span.type}:{span.name}"


def _compare_common_spans(
    baseline_by_key: dict[str, SpanModel],
    candidate_by_key: dict[str, SpanModel],
) -> list[dict[str, Any]]:
    changed: list[dict[str, Any]] = []
    common_keys = baseline_by_key.keys() & candidate_by_key.keys()
    for span_key in sorted(common_keys):
        baseline_span = baseline_by_key[span_key]
        candidate_span = candidate_by_key[span_key]
        deltas = {
            "latency_ms": (candidate_span.metrics or {}).get("latency_ms", 0)
            - (baseline_span.metrics or {}).get("latency_ms", 0),
            "status_changed": baseline_span.status != candidate_span.status,
            "output_changed": (baseline_span.output or {})
            != (candidate_span.output or {}),
        }
        if (
            deltas["latency_ms"]
            or deltas["status_changed"]
            or deltas["output_changed"]
        ):
            changed.append({"node": span_key, **deltas})
    return changed


def build_run_comparison(
    baseline: AgentRunModel,
    candidate: AgentRunModel,
    baseline_spans: Sequence[SpanModel],
    candidate_spans: Sequence[SpanModel],
) -> RunCompareResponse:
    """Build the API comparison for two runs and their trace spans."""
    baseline_by_key = {_span_key(span): span for span in baseline_spans}
    candidate_by_key = {_span_key(span): span for span in candidate_spans}
    baseline_keys = baseline_by_key.keys()
    candidate_keys = candidate_by_key.keys()

    return RunCompareResponse(
        baseline_run_id=baseline.id,
        candidate_run_id=candidate.id,
        nodes_added=sorted(candidate_keys - baseline_keys),
        nodes_removed=sorted(baseline_keys - candidate_keys),
        nodes_changed=_compare_common_spans(baseline_by_key, candidate_by_key),
        summary={
            "baseline_trace_id": baseline.trace_id,
            "candidate_trace_id": candidate.trace_id,
            "baseline_span_count": len(baseline_spans),
            "candidate_span_count": len(candidate_spans),
            "cost_delta": float(candidate.total_cost or 0)
            - float(baseline.total_cost or 0),
            "latency_delta": float(candidate.total_latency or 0)
            - float(baseline.total_latency or 0),
            "token_delta": int(candidate.total_tokens or 0)
            - int(baseline.total_tokens or 0),
        },
    )
