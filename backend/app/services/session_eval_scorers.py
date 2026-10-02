"""Pure scoring algorithms for trajectory-aware session evaluations."""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional, Tuple

from app.models import SpanModel, SpanType

def extract_telemetry_text(value: Any, keys: List[str]) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        for key in keys:
            data = value.get(key)
            if isinstance(data, str):
                return data
        choices = value.get("choices")
        if isinstance(choices, list) and choices:
            message = choices[0].get("message", {})
            content = message.get("content")
            if isinstance(content, str):
                return content
    if value is None:
        return ""
    try:
        return json.dumps(value, ensure_ascii=True)
    except TypeError:
        return str(value)


def _extract_tool_name(span: SpanModel) -> Optional[str]:
    attrs = span.attributes or {}
    name = attrs.get("tool_name") or attrs.get("tool")
    if name:
        return str(name)
    lowered = (span.name or "").lower()
    if lowered.startswith("tool"):
        if ":" in span.name:
            return span.name.split(":", 1)[1].strip()
        if "-" in span.name:
            return span.name.split("-", 1)[1].strip()
    return None


def _tool_signature(tool_name: str, args: Any) -> str:
    try:
        args_str = json.dumps(args, sort_keys=True, ensure_ascii=True)
    except TypeError:
        args_str = str(args)
    return f"{tool_name}::{args_str}"


def score_tool_correctness(
    spans: List[SpanModel],
    config: Dict[str, Any],
) -> Tuple[Optional[float], Dict[str, Any], List[str]]:
    tool_spans = [span for span in spans if span.type == SpanType.TOOL]
    required_tools = [str(name) for name in config.get("required_tools", [])]
    allow_extra = config.get("allow_extra", True)

    tool_calls: List[Dict[str, Any]] = []
    invalid_nodes: List[str] = []
    tool_names: List[str] = []

    for span in tool_spans:
        attrs = span.attributes or {}
        tool_name = _extract_tool_name(span) or "unknown"
        schema_valid = attrs.get("tool_schema_valid", True)
        errors = attrs.get("tool_schema_errors") or []
        if errors or schema_valid is False:
            invalid_nodes.append(span.id)
        tool_names.append(tool_name)
        tool_calls.append(
            {
                "span_id": span.id,
                "tool_name": tool_name,
                "schema_valid": schema_valid,
                "schema_errors": errors,
            }
        )

    if not tool_spans and required_tools:
        return 0.0, {
            "tool_calls": tool_calls,
            "required_tools": required_tools,
            "missing_tools": required_tools,
            "sequence_ok": False,
            "message": "No tool calls found",
            "failing_nodes": [],
        }, []

    valid_ratio = 1.0
    if tool_spans:
        valid_ratio = (len(tool_spans) - len(invalid_nodes)) / len(tool_spans)

    missing_tools: List[str] = []
    sequence_ok = True
    if required_tools:
        cursor = 0
        lowered_required = [name.lower() for name in required_tools]
        lowered_calls = [name.lower() for name in tool_names]
        for called in lowered_calls:
            if cursor < len(lowered_required) and called == lowered_required[cursor]:
                cursor += 1
        if cursor < len(lowered_required):
            missing_tools = required_tools[cursor:]
            sequence_ok = False

    score = valid_ratio
    if required_tools:
        required_ratio = (len(required_tools) - len(missing_tools)) / len(required_tools)
        score = min(score, required_ratio)
    if not allow_extra and required_tools and len(tool_spans) > len(required_tools):
        overflow = len(tool_spans) - len(required_tools)
        score = max(score - (overflow / max(len(tool_spans), 1)) * 0.5, 0.0)

    details = {
        "tool_calls": tool_calls,
        "required_tools": required_tools,
        "missing_tools": missing_tools,
        "sequence_ok": sequence_ok,
        "invalid_calls": len(invalid_nodes),
        "failing_nodes": invalid_nodes,
    }
    return score, details, invalid_nodes


def score_path_efficiency(
    spans: List[SpanModel],
    config: Dict[str, Any],
) -> Tuple[Optional[float], Dict[str, Any], List[str]]:
    tool_spans = [span for span in spans if span.type == SpanType.TOOL]
    tool_spans.sort(key=lambda span: (span.start_time or 0, span.id))
    loop_threshold = int(config.get("loop_threshold", 2))
    max_tool_calls = config.get("max_tool_calls")
    max_retries = config.get("max_retries")

    signature_map: Dict[str, List[str]] = {}
    redundant_nodes: List[str] = []
    retry_nodes: List[str] = []

    for span in tool_spans:
        attrs = span.attributes or {}
        tool_name = _extract_tool_name(span) or "unknown"
        args = attrs.get("tool_args") or span.input
        signature = _tool_signature(tool_name, args)
        signature_map.setdefault(signature, []).append(span.id)

        retry_parent = attrs.get("retry_parent_id") or attrs.get("retry_of")
        if retry_parent:
            retry_nodes.append(span.id)

    for span_ids in signature_map.values():
        if len(span_ids) > loop_threshold:
            redundant_nodes.extend(span_ids[loop_threshold:])

    tool_count = len(tool_spans)
    retry_count = len(retry_nodes)

    score = 1.0
    penalty = 0.0
    if tool_count and redundant_nodes:
        penalty += min(0.4, (len(redundant_nodes) / tool_count) * 0.4)
    if max_tool_calls and tool_count > max_tool_calls:
        penalty += min(0.3, ((tool_count - max_tool_calls) / max_tool_calls) * 0.3)
    if max_retries and retry_count > max_retries:
        penalty += min(0.3, ((retry_count - max_retries) / max_retries) * 0.3)

    score = max(1.0 - penalty, 0.0)
    failing_nodes = list({*redundant_nodes, *retry_nodes})

    details = {
        "tool_call_count": tool_count,
        "retry_count": retry_count,
        "redundant_calls": redundant_nodes,
        "retry_nodes": retry_nodes,
        "failing_nodes": failing_nodes,
        "loop_threshold": loop_threshold,
        "max_tool_calls": max_tool_calls,
        "max_retries": max_retries,
    }
    return score, details, failing_nodes


def score_outcome(
    output_data: Any,
    output_text: str,
    output_span_id: Optional[str],
    config: Dict[str, Any],
) -> Tuple[Optional[float], Dict[str, Any], List[str]]:
    task_type = config.get("task_type", "classification")
    expected = config.get("expected")
    label_field = config.get("label_field")

    if expected is None:
        return None, {"error": "expected value is required for outcome scoring"}, []

    if task_type == "classification":
        actual_label = ""
        if label_field and isinstance(output_data, dict):
            label_value = output_data.get(label_field)
            if label_value is not None:
                actual_label = str(label_value)
        if not actual_label:
            actual_label = output_text
        expected_labels = expected if isinstance(expected, list) else [expected]
        normalized_expected = [str(label).strip().lower() for label in expected_labels]
        normalized_actual = str(actual_label).strip().lower()
        score = 1.0 if normalized_actual in normalized_expected else 0.0
        details = {
            "task_type": task_type,
            "expected": expected,
            "actual": actual_label,
        }
        failing_nodes = [output_span_id] if score < 1.0 and output_span_id else []
        return score, details, failing_nodes

    if task_type == "extract-structure":
        if not isinstance(expected, dict):
            return None, {"error": "expected must be an object for extract-structure"}, []
        actual_payload = output_data
        if not isinstance(actual_payload, dict):
            try:
                actual_payload = json.loads(output_text)
            except json.JSONDecodeError:
                actual_payload = None
        if not isinstance(actual_payload, dict):
            return 0.0, {
                "task_type": task_type,
                "error": "output is not valid JSON",
                "expected": expected,
                "actual": output_text,
            }, [output_span_id] if output_span_id else []

        mismatches = []
        matches = 0
        for key, expected_value in expected.items():
            actual_value = actual_payload.get(key)
            if actual_value == expected_value:
                matches += 1
            else:
                mismatches.append({
                    "field": key,
                    "expected": expected_value,
                    "actual": actual_value,
                })
        score = matches / max(len(expected), 1)
        details = {
            "task_type": task_type,
            "expected": expected,
            "actual": actual_payload,
            "matches": matches,
            "mismatches": mismatches,
        }
        failing_nodes = [output_span_id] if score < 1.0 and output_span_id else []
        return score, details, failing_nodes

    return None, {"error": f"unknown task_type: {task_type}"}, []
