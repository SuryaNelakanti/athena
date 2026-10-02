"""Normalize tool and retrieval telemetry before it becomes persisted spans."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from app.models import SpanMetrics
from app.schemas.session_ingest import IngestSpan


def _extract_tool_name(name: Optional[str]) -> Optional[str]:
    if not name:
        return None
    trimmed = name.strip()
    lowered = trimmed.lower()
    if lowered.startswith("tool"):
        if ":" in trimmed:
            return trimmed.split(":", 1)[1].strip()
        if "-" in trimmed:
            return trimmed.split("-", 1)[1].strip()
    return None


def normalize_tool_span(
    span: IngestSpan,
    input_data: Dict[str, Any],
    output_data: Dict[str, Any],
    attributes: Dict[str, Any],
    metrics: SpanMetrics,
) -> tuple[Dict[str, Any], Dict[str, Any], Dict[str, Any]]:
    attrs = dict(attributes)
    errors: List[str] = []

    tool_name = (
        attrs.get("tool_name")
        or attrs.get("tool")
        or input_data.get("tool_name")
        or input_data.get("tool")
        or output_data.get("tool_name")
        or output_data.get("tool")
        or _extract_tool_name(span.name)
    )
    if not tool_name:
        errors.append("tool_name missing")

    args = (
        input_data.get("args")
        or input_data.get("arguments")
        or input_data.get("params")
        or input_data.get("parameters")
    )
    if args is None:
        args = input_data or None
    if args is None:
        errors.append("args missing")

    result = (
        output_data.get("result")
        or output_data.get("output")
        or output_data.get("response")
    )
    if result is None:
        result = output_data or None
    if result is None:
        errors.append("result missing")

    if tool_name:
        attrs["tool_name"] = tool_name
    if args is not None:
        attrs["tool_args"] = args
    if result is not None:
        attrs["tool_result"] = result

    attrs.setdefault("tool_status", span.status)
    attrs.setdefault("tool_duration_ms", metrics.latency_ms)

    if errors:
        attrs["tool_schema_errors"] = errors
        attrs["tool_schema_valid"] = False
    else:
        attrs.setdefault("tool_schema_valid", True)

    return input_data, output_data, attrs


def normalize_retrieval_span(
    input_data: Dict[str, Any],
    output_data: Dict[str, Any],
    attributes: Dict[str, Any],
) -> tuple[Dict[str, Any], Dict[str, Any], Dict[str, Any]]:
    attrs = dict(attributes)
    errors: List[str] = []

    query = input_data.get("query") or input_data.get("text") or input_data.get("prompt")
    if not query:
        errors.append("query missing")

    documents = (
        output_data.get("documents")
        or output_data.get("docs")
        or output_data.get("results")
    )
    if documents is None:
        errors.append("documents missing")
        documents = []
    if not isinstance(documents, list):
        errors.append("documents must be a list")
        documents = []

    doc_ids: List[Any] = []
    scores: List[Any] = []
    for doc in documents:
        if not isinstance(doc, dict):
            continue
        doc_id = doc.get("id") or doc.get("doc_id") or doc.get("document_id")
        if doc_id is not None:
            doc_ids.append(doc_id)
        score = doc.get("score") or doc.get("similarity") or doc.get("rank_score")
        if score is not None:
            scores.append(score)

    citations = output_data.get("citations") or output_data.get("citation")

    if query:
        attrs["retrieval_query"] = query
    attrs["retrieval_top_k"] = len(documents)
    if doc_ids:
        attrs["retrieval_doc_ids"] = doc_ids
    if scores:
        attrs["retrieval_scores"] = scores
    if citations is not None:
        attrs["retrieval_citations"] = citations

    if errors:
        attrs["retrieval_schema_errors"] = errors
        attrs["retrieval_schema_valid"] = False
    else:
        attrs.setdefault("retrieval_schema_valid", True)

    return input_data, output_data, attrs
