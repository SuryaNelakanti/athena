from __future__ import annotations

from typing import Sequence

from app.models import AgentRunModel, SpanModel, SpanType
from app.schemas.sessions import CausalChainNode, RunGraphEdge, RunGraphNode, RunGraphResponse


def _span_kind(span: SpanModel) -> str:
    if span.type == SpanType.LLM:
        return "llm_call"
    if span.type == SpanType.TOOL:
        return "tool_call"
    if span.type == SpanType.RETRIEVER:
        return "retrieval"
    if span.type == SpanType.CHAIN:
        return "chain"
    if "guardrail" in (span.name or "").lower():
        return "guardrail"
    return "span"


def _retry_parent_id(span: SpanModel) -> str | None:
    attributes = span.attributes
    if not isinstance(attributes, dict):
        return None
    return attributes.get("retry_parent_id") or attributes.get("retry_of")


def _depth_for(span_id: str, spans_by_id: dict[str, SpanModel], cache: dict[str, int]) -> int:
    path: list[str] = []
    visited: set[str] = set()
    current_id = span_id

    while current_id in spans_by_id and current_id not in cache and current_id not in visited:
        visited.add(current_id)
        parent_id = spans_by_id[current_id].parent_id
        if not parent_id or parent_id not in spans_by_id:
            cache[current_id] = 0
            break
        path.append(current_id)
        current_id = parent_id

    depth = cache.get(current_id, 0)
    for current_id in reversed(path):
        depth += 1
        cache[current_id] = depth
    return cache.get(span_id, 0)


def _causal_chain(span_id: str, spans_by_id: dict[str, SpanModel]) -> list[CausalChainNode]:
    chain: list[CausalChainNode] = []
    visited: set[str] = set()
    span = spans_by_id.get(span_id)
    current_id = span.parent_id if span else None

    while current_id and current_id in spans_by_id and current_id not in visited:
        visited.add(current_id)
        parent = spans_by_id[current_id]
        chain.append(CausalChainNode(id=parent.id, name=parent.name, status=parent.status))
        current_id = parent.parent_id
    return chain


def build_run_graph(
    run: AgentRunModel,
    spans: Sequence[SpanModel],
) -> RunGraphResponse:
    if not run.trace_id:
        raise ValueError("Run has no trace_id")
    if not spans:
        raise ValueError("Trace has no spans")

    spans_by_id = {span.id: span for span in spans}
    root_span = next((span for span in spans if span.parent_id is None), None)
    if root_span is None:
        root_span = min(spans, key=lambda span: span.start_time)

    edges = [
        RunGraphEdge(from_id=span.parent_id, to_id=span.id, kind="parent")
        for span in spans
        if span.parent_id and span.parent_id in spans_by_id
    ]
    edges.extend(
        RunGraphEdge(from_id=retry_parent_id, to_id=span.id, kind="retry")
        for span in spans
        if (retry_parent_id := _retry_parent_id(span)) in spans_by_id
    )

    depth_cache: dict[str, int] = {}
    lane_counts: dict[int, int] = {}
    nodes: list[RunGraphNode] = []
    ordered_spans = sorted(spans, key=lambda span: (span.start_time, span.end_time, span.id))
    for span in ordered_spans:
        depth = _depth_for(span.id, spans_by_id, depth_cache)
        lane = lane_counts.get(depth, 0)
        lane_counts[depth] = lane + 1
        nodes.append(
            RunGraphNode(
                id=span.id,
                span_id=span.id,
                name=span.name,
                kind=_span_kind(span),
                status=span.status,
                start_time=span.start_time,
                end_time=span.end_time,
                duration_ms=max(float(span.end_time - span.start_time), 0.0),
                depth=depth,
                lane=lane,
                parent_id=span.parent_id,
                retry_parent_id=_retry_parent_id(span),
                input=span.input or {},
                output=span.output or {},
                attributes=span.attributes or {},
                metrics=span.metrics or {},
                tags=span.tags or [],
                error_message=span.error_message,
                causal_chain=_causal_chain(span.id, spans_by_id),
            )
        )

    return RunGraphResponse(
        run_id=run.id,
        trace_id=run.trace_id,
        root_id=root_span.id,
        nodes=nodes,
        edges=edges,
        layout={
            "max_depth": max((node.depth for node in nodes), default=0),
            "max_lane": max((node.lane for node in nodes), default=0),
            "lane_counts": lane_counts,
        },
    )
