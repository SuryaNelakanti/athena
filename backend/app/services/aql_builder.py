from __future__ import annotations

from collections.abc import Callable, Mapping
from typing import Any, Optional

from app.services.aql_errors import AQLParseError
from app.services.aql_values import AQLValueCodec


def build_query_from_builder(
    builder: dict[str, Any],
    shapes: Mapping[str, Mapping[str, Any]],
    default_measure_alias: Callable[[str, Optional[str]], str],
) -> str:
    shape_name = builder.get("shape")
    if not shape_name:
        raise AQLParseError("Builder is missing shape")
    shape = shapes.get(shape_name)
    if not shape:
        raise AQLParseError(f"Unknown shape '{shape_name}'")

    params = builder.get("params") or {}
    select_fields = builder.get("select") or []
    filters = builder.get("filters") or []
    dimensions = builder.get("dimensions") or []
    measures = builder.get("measures") or []
    parts = [f"from {shape_name}{_format_params(params)}"]

    if select_fields:
        parts.append(f"select {', '.join(select_fields)}")
    elif not dimensions and not measures:
        parts.append("select *")

    filter_clause = _format_filter_clause(filters, shape)
    if filter_clause:
        parts.append(filter_clause)
    if dimensions:
        parts.append(f"dimensions {', '.join(dimensions)}")

    measure_clause = _format_measure_clause(measures, default_measure_alias)
    if measure_clause:
        parts.append(measure_clause)

    sort_clause = _format_sort_clause(builder.get("sort"), shape)
    if sort_clause:
        parts.append(sort_clause)
    limit_clause = _format_limit_clause(builder.get("limit"))
    if limit_clause:
        parts.append(limit_clause)
    return " ".join(parts)


def _format_params(params: Mapping[str, Any]) -> str:
    if not params:
        return ""
    formatted = [
        f"{key}={AQLValueCodec.format_literal(params[key], 'string')}"
        for key in sorted(params.keys())
    ]
    return f"({', '.join(formatted)})"


def _format_filter_clause(filters: list[dict[str, Any]], shape: Mapping[str, Any]) -> str:
    filter_fields = shape["filter_fields"]
    field_types = shape.get("field_types", {})
    clauses: list[str] = []
    for raw_filter in filters:
        field = raw_filter.get("field")
        operator = raw_filter.get("op")
        value = raw_filter.get("value")
        if not field or not operator:
            continue
        if field not in filter_fields:
            raise AQLParseError(f"Field '{field}' cannot be filtered")
        field_type = field_types.get(field, "string")
        normalized_operator = (
            operator.lower() if operator.lower() in {"contains", "in"} else operator
        )
        literal = AQLValueCodec.format_literal(value, field_type, normalized_operator)
        clauses.append(f"{field} {normalized_operator} {literal}")
    return f"filter {' and '.join(clauses)}" if clauses else ""


def _format_measure_clause(
    measures: list[dict[str, Any]],
    default_measure_alias: Callable[[str, Optional[str]], str],
) -> str:
    formatted: list[str] = []
    for measure in measures:
        func = str(measure.get("func") or "").lower()
        if not func:
            continue
        field = measure.get("field") or "*"
        alias = measure.get("alias") or default_measure_alias(func, field)
        formatted.append(f"{func}({field}) as {alias}")
    return f"measures {', '.join(formatted)}" if formatted else ""


def _format_sort_clause(sort: Any, shape: Mapping[str, Any]) -> str:
    if sort and sort.get("field"):
        direction = str(sort.get("direction") or "asc").lower()
        if direction not in {"asc", "desc"}:
            raise AQLParseError("Sort direction must be asc or desc")
        return f"sort {sort['field']} {direction}"

    default_sort = shape.get("default_sort")
    if default_sort:
        return f"sort {default_sort[0]} {default_sort[1]}"
    return ""


def _format_limit_clause(limit: Any) -> str:
    if limit is None:
        return ""
    try:
        limit_value = int(limit)
    except (TypeError, ValueError):
        raise AQLParseError("Limit must be an integer")
    return f"limit {limit_value}"
