from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

from app.models import AgentRunModel, Span, SpanAttributes, SpanMetrics, SpanType, Trace
from app.schemas.session_ingest import IngestTrace
from app.services.session_ingest_span_normalizer import (
    normalize_retrieval_span,
    normalize_tool_span,
)


def now_ms() -> int:
    return int(time.time() * 1000)


def normalize_run_status(value: Optional[str]) -> str:
    if not value:
        return "completed"
    lowered = value.lower()
    if lowered in {"completed", "complete", "success", "succeeded", "ok"}:
        return "completed"
    if lowered in {"error", "failed", "failure"}:
        return "error"
    if lowered in {"active", "running", "in_progress"}:
        return "active"
    return value


def run_sort_key(run: AgentRunModel) -> int:
    if run.ended_at:
        return run.ended_at
    if run.started_at:
        return run.started_at
    return 0


def merge_tags(existing: List[str], incoming: List[str]) -> List[str]:
    seen = set(existing)
    merged = list(existing)
    for tag in incoming:
        if tag not in seen:
            merged.append(tag)
            seen.add(tag)
    return merged


def merge_metadata(existing: Dict[str, Any], incoming: Dict[str, Any]) -> Dict[str, Any]:
    merged = dict(existing)
    merged.update(incoming)
    return merged


def _normalize_metrics(metrics: Optional[Dict[str, Any]]) -> SpanMetrics:
    data = dict(metrics or {})
    if "latency_ms" not in data:
        data["latency_ms"] = 0.0
    return SpanMetrics(**data)


def _normalize_attributes(attributes: Optional[Dict[str, Any]]) -> SpanAttributes:
    return SpanAttributes(**(attributes or {}))


def _separate_reasoning(
    output_data: Dict[str, Any],
    attributes: Dict[str, Any],
) -> tuple[Dict[str, Any], Dict[str, Any]]:
    reasoning = (
        output_data.get("athena_reasoning")
        or output_data.get("reasoning")
        or output_data.get("reasoning_content")
    )
    if reasoning:
        attributes = dict(attributes)
        attributes.setdefault("reasoning_content", reasoning)
        attributes.setdefault("reasoning_enabled", True)
        output_data = dict(output_data)
        for key in ("athena_reasoning", "reasoning", "reasoning_content"):
            output_data.pop(key, None)
    return output_data, attributes


def build_ingest_trace(
    ingest_trace: IngestTrace,
    project_id: str,
    session_id: str,
) -> Trace:
    spans: List[Span] = []
    for span in ingest_trace.spans:
        span_metrics = _normalize_metrics(span.metrics)
        input_data = dict(span.input or {})
        output_data = dict(span.output or {})
        attributes = dict(span.attributes or {})

        if span.type == SpanType.LLM:
            output_data, attributes = _separate_reasoning(output_data, attributes)
        if span.type == SpanType.TOOL:
            input_data, output_data, attributes = normalize_tool_span(
                span,
                input_data,
                output_data,
                attributes,
                span_metrics,
            )
        if span.type == SpanType.RETRIEVER:
            input_data, output_data, attributes = normalize_retrieval_span(
                input_data,
                output_data,
                attributes,
            )

        span_attributes = _normalize_attributes(attributes)
        spans.append(
            Span(
                id=span.id,
                trace_id=ingest_trace.trace_id,
                parent_id=span.parent_id,
                name=span.name,
                type=span.type,
                start_time=span.start_time,
                end_time=span.end_time,
                status=span.status,
                input=input_data,
                output=output_data,
                metrics=span_metrics,
                attributes=span_attributes,
                tags=span.tags,
                error_message=span.error_message,
            )
        )

    if not spans:
        raise ValueError("Trace must include at least one span")

    root_span = next((span for span in spans if not span.parent_id), None)
    if not root_span:
        raise ValueError("Trace must include a root span with no parent_id")

    return Trace(
        id=ingest_trace.trace_id,
        root_span=root_span,
        spans=spans,
        project_id=project_id,
        parent_trace_id=ingest_trace.parent_trace_id,
        trace_group_id=ingest_trace.trace_group_id or session_id,
        input_span_id=ingest_trace.input_span_id,
        output_span_id=ingest_trace.output_span_id,
        timestamp=ingest_trace.timestamp,
        total_latency=ingest_trace.total_latency or 0.0,
        total_cost=ingest_trace.total_cost or 0.0,
        total_tokens=ingest_trace.total_tokens or 0,
        status=ingest_trace.status,
        tags=ingest_trace.tags,
    )
