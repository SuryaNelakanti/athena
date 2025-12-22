from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional, List
import re
import time
import math

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.models import (
    LogModel,
    TraceModel,
    SpanModel,
    ExperimentRunResultModel,
    ExperimentRunModel,
    ExperimentVersionModel,
    ExperimentModel,
)


def _project_spans_stmt():
    return select(SpanModel).join(TraceModel, SpanModel.trace_id == TraceModel.id)


def _experiment_outputs_stmt():
    return (
        select(ExperimentRunResultModel)
        .join(ExperimentRunModel, ExperimentRunResultModel.run_id == ExperimentRunModel.id)
        .join(ExperimentVersionModel, ExperimentRunModel.experiment_version_id == ExperimentVersionModel.id)
        .join(ExperimentModel, ExperimentVersionModel.experiment_id == ExperimentModel.id)
    )


class AQLParseError(ValueError):
    pass


@dataclass
class AQLFilter:
    field: str
    op: str
    value: Any


@dataclass
class AQLMeasure:
    func: str
    field: Optional[str]
    alias: str


@dataclass
class AQLSort:
    field: str
    direction: str


@dataclass
class AQLQuery:
    shape: str
    params: dict[str, Any]
    select_fields: list[str]
    filters: list[AQLFilter]
    dimensions: list[str]
    measures: list[AQLMeasure]
    sort: Optional[AQLSort]
    limit: Optional[int]


class AQLService:
    SHAPES = {
        "project_logs": {
            "model": LogModel,
            "param_filters": {"project_id": LogModel.project_id},
            "fields": {
                "id": LogModel.id,
                "project_id": LogModel.project_id,
                "trace_id": LogModel.trace_id,
                "span_id": LogModel.span_id,
                "level": LogModel.level,
                "event_type": LogModel.event_type,
                "status": LogModel.status,
                "message": LogModel.message,
                "timestamp": LogModel.timestamp,
                "latency_ms": LogModel.latency_ms,
                "prompt_tokens": LogModel.prompt_tokens,
                "completion_tokens": LogModel.completion_tokens,
                "total_tokens": LogModel.total_tokens,
                "cost": LogModel.cost,
                "model": LogModel.model,
                "provider": LogModel.provider,
                "attributes": LogModel.attributes,
                "log_metadata": LogModel.log_metadata,
                "created_at": LogModel.created_at,
            },
            "field_types": {
                "id": "string",
                "project_id": "string",
                "trace_id": "string",
                "span_id": "string",
                "level": "string",
                "event_type": "string",
                "status": "string",
                "message": "string",
                "model": "string",
                "provider": "string",
                "timestamp": "number",
                "latency_ms": "number",
                "prompt_tokens": "number",
                "completion_tokens": "number",
                "total_tokens": "number",
                "cost": "number",
                "created_at": "number",
            },
            "filter_fields": {
                "id",
                "project_id",
                "trace_id",
                "span_id",
                "level",
                "event_type",
                "status",
                "message",
                "timestamp",
                "latency_ms",
                "prompt_tokens",
                "completion_tokens",
                "total_tokens",
                "cost",
                "model",
                "provider",
                "created_at",
            },
            "default_sort": ("timestamp", "desc"),
        },
        "project_traces": {
            "model": TraceModel,
            "param_filters": {"project_id": TraceModel.project_id},
            "fields": {
                "id": TraceModel.id,
                "project_id": TraceModel.project_id,
                "timestamp": TraceModel.timestamp,
                "total_latency": TraceModel.total_latency,
                "total_cost": TraceModel.total_cost,
                "total_tokens": TraceModel.total_tokens,
                "status": TraceModel.status,
                "tags": TraceModel.tags,
            },
            "field_types": {
                "id": "string",
                "project_id": "string",
                "status": "string",
                "timestamp": "number",
                "total_latency": "number",
                "total_cost": "number",
                "total_tokens": "number",
            },
            "filter_fields": {
                "id",
                "project_id",
                "timestamp",
                "total_latency",
                "total_cost",
                "total_tokens",
                "status",
            },
            "default_sort": ("timestamp", "desc"),
        },
        "project_spans": {
            "model": SpanModel,
            "base_stmt": _project_spans_stmt,
            "param_filters": {"project_id": TraceModel.project_id},
            "fields": {
                "id": SpanModel.id,
                "project_id": TraceModel.project_id,
                "trace_id": SpanModel.trace_id,
                "parent_id": SpanModel.parent_id,
                "name": SpanModel.name,
                "type": SpanModel.type,
                "start_time": SpanModel.start_time,
                "end_time": SpanModel.end_time,
                "status": SpanModel.status,
                "error_message": SpanModel.error_message,
                "metrics": SpanModel.metrics,
                "attributes": SpanModel.attributes,
                "tags": SpanModel.tags,
                "input": SpanModel.input,
                "output": SpanModel.output,
            },
            "field_types": {
                "id": "string",
                "project_id": "string",
                "trace_id": "string",
                "parent_id": "string",
                "name": "string",
                "type": "string",
                "status": "string",
                "start_time": "number",
                "end_time": "number",
            },
            "filter_fields": {
                "id",
                "project_id",
                "trace_id",
                "parent_id",
                "name",
                "type",
                "status",
                "start_time",
                "end_time",
            },
            "default_sort": ("start_time", "desc"),
        },
        "experiment_outputs": {
            "model": ExperimentRunResultModel,
            "base_stmt": _experiment_outputs_stmt,
            "param_filters": {"experiment_id": ExperimentModel.id},
            "fields": {
                "id": ExperimentRunResultModel.id,
                "experiment_id": ExperimentModel.id,
                "project_id": ExperimentModel.project_id,
                "experiment_version_id": ExperimentRunModel.experiment_version_id,
                "run_id": ExperimentRunResultModel.run_id,
                "run_status": ExperimentRunModel.status,
                "dataset_row_id": ExperimentRunResultModel.dataset_row_id,
                "latency_ms": ExperimentRunResultModel.latency_ms,
                "output": ExperimentRunResultModel.output,
                "scores": ExperimentRunResultModel.scores,
                "created_at": ExperimentRunResultModel.created_at,
            },
            "field_types": {
                "id": "string",
                "experiment_id": "string",
                "project_id": "string",
                "experiment_version_id": "string",
                "run_id": "string",
                "run_status": "string",
                "dataset_row_id": "string",
                "latency_ms": "number",
                "created_at": "number",
            },
            "filter_fields": {
                "id",
                "experiment_id",
                "project_id",
                "experiment_version_id",
                "run_id",
                "run_status",
                "dataset_row_id",
                "latency_ms",
                "created_at",
            },
            "default_sort": ("created_at", "desc"),
        },
    }
    SHAPES["experiment_logs"] = SHAPES["experiment_outputs"]

    KEYWORD_PATTERN = re.compile(
        r"\b(from|select|filter|where|dimensions|measures|sort|limit)\b",
        re.IGNORECASE,
    )

    def parse(self, query: str) -> AQLQuery:
        if not query or not query.strip():
            raise AQLParseError("Query is empty")

        clauses = self._split_clauses(query)
        from_clause = clauses.get("from")
        if not from_clause:
            raise AQLParseError("Missing FROM clause")

        shape, params = self._parse_from(from_clause)
        select_fields = self._parse_field_list(clauses.get("select"))
        filter_clause = clauses.get("filter") or clauses.get("where")
        filters = self._parse_filters(filter_clause)
        dimensions = self._parse_field_list(clauses.get("dimensions"))
        measures = self._parse_measures(clauses.get("measures"))
        sort = self._parse_sort(clauses.get("sort"))
        limit = self._parse_limit(clauses.get("limit"))

        return AQLQuery(
            shape=shape,
            params=params,
            select_fields=select_fields,
            filters=filters,
            dimensions=dimensions,
            measures=measures,
            sort=sort,
            limit=limit,
        )

    def build_query_from_builder(self, builder: dict[str, Any]) -> str:
        shape_name = builder.get("shape")
        if not shape_name:
            raise AQLParseError("Builder is missing shape")
        shape = self.SHAPES.get(shape_name)
        if not shape:
            raise AQLParseError(f"Unknown shape '{shape_name}'")

        params = builder.get("params") or {}
        select_fields = builder.get("select") or []
        filters = builder.get("filters") or []
        dimensions = builder.get("dimensions") or []
        measures = builder.get("measures") or []
        sort = builder.get("sort")
        limit = builder.get("limit")

        parts: list[str] = []
        params_clause = ""
        if params:
            params_parts = []
            for key in sorted(params.keys()):
                params_parts.append(f"{key}={self._format_literal(params[key], 'string')}")
            params_clause = f"({', '.join(params_parts)})"
        parts.append(f"from {shape_name}{params_clause}")

        if select_fields:
            parts.append(f"select {', '.join(select_fields)}")
        elif not dimensions and not measures:
            parts.append("select *")

        filter_fields = shape["filter_fields"]
        field_types = shape.get("field_types", {})
        filter_clauses: list[str] = []
        for raw in filters:
            field = raw.get("field")
            op = raw.get("op")
            value = raw.get("value")
            if not field or not op:
                continue
            if field not in filter_fields:
                raise AQLParseError(f"Field '{field}' cannot be filtered")
            field_type = field_types.get(field, "string")
            op_norm = op.lower() if op.lower() in {"contains", "in"} else op
            literal = self._format_literal(value, field_type, op_norm)
            filter_clauses.append(f"{field} {op_norm} {literal}")
        if filter_clauses:
            parts.append(f"filter {' and '.join(filter_clauses)}")

        if dimensions:
            parts.append(f"dimensions {', '.join(dimensions)}")

        if measures:
            measure_parts: list[str] = []
            for measure in measures:
                func = str(measure.get("func") or "").lower()
                if not func:
                    continue
                field = measure.get("field") or "*"
                alias = measure.get("alias") or self._default_measure_alias(func, field)
                measure_parts.append(f"{func}({field}) as {alias}")
            if measure_parts:
                parts.append(f"measures {', '.join(measure_parts)}")

        if sort and sort.get("field"):
            direction = str(sort.get("direction") or "asc").lower()
            if direction not in {"asc", "desc"}:
                raise AQLParseError("Sort direction must be asc or desc")
            parts.append(f"sort {sort['field']} {direction}")
        else:
            default_sort = shape.get("default_sort")
            if default_sort:
                parts.append(f"sort {default_sort[0]} {default_sort[1]}")

        if limit is not None:
            try:
                limit_val = int(limit)
            except (TypeError, ValueError):
                raise AQLParseError("Limit must be an integer")
            parts.append(f"limit {limit_val}")

        return " ".join(parts)

    async def execute(self, session: AsyncSession, query: AQLQuery) -> dict[str, Any]:
        shape = self.SHAPES.get(query.shape)
        if not shape:
            raise AQLParseError(f"Unknown shape '{query.shape}'")

        fields = shape["fields"]
        filter_fields = shape["filter_fields"]
        stmt = self._build_base_stmt(shape)
        param_filters = shape.get("param_filters", {})
        for param, col in param_filters.items():
            value = query.params.get(param)
            if value is None:
                raise AQLParseError(f"Missing {param} in FROM clause")
            stmt = stmt.where(col == value)

        for filt in query.filters:
            if filt.field not in filter_fields:
                raise AQLParseError(f"Field '{filt.field}' cannot be filtered")
            col = fields.get(filt.field)
            stmt = self._apply_filter(stmt, col, filt)

        data_rows = []
        if query.measures or query.dimensions:
            required_fields = self._required_fields_for_aggregate(query, fields)
            stmt = self._with_selected_columns(stmt, fields, required_fields)
            result = await session.execute(stmt)
            records = result.mappings().all()
            data_rows = self._aggregate_rows(records, query, fields)
            data_rows = self._sort_rows(data_rows, query.sort)
            if query.limit is not None:
                data_rows = data_rows[: query.limit]
        else:
            select_fields = self._resolve_select_fields(query.select_fields, fields)
            stmt = self._with_selected_columns(stmt, fields, select_fields)
            sort = query.sort or self._default_sort(shape)
            if sort:
                col = fields.get(sort.field)
                if col is not None:
                    stmt = stmt.order_by(col.desc() if sort.direction == "desc" else col.asc())
            if query.limit is not None:
                stmt = stmt.limit(query.limit)
            
            result = await session.execute(stmt)
            records = result.mappings().all()
            for record in records:
                row = {field: record.get(field) for field in select_fields}
                data_rows.append(row)

        schema = list(data_rows[0].keys()) if data_rows else self._schema_for_query(query, fields)
        return {
            "shape": query.shape,
            "schema": schema,
            "data": data_rows,
        }

    def _split_clauses(self, query: str) -> dict[str, str]:
        matches = list(self.KEYWORD_PATTERN.finditer(query))
        if not matches:
            raise AQLParseError("Query must include a FROM clause")

        clauses: dict[str, str] = {}
        for idx, match in enumerate(matches):
            key = match.group(1).lower()
            start = match.end()
            end = matches[idx + 1].start() if idx + 1 < len(matches) else len(query)
            clauses[key] = query[start:end].strip()
        return clauses

    def _parse_from(self, clause: str) -> tuple[str, dict[str, Any]]:
        match = re.match(r"^([a-zA-Z_][\w]*)\s*(?:\((.*)\))?$", clause.strip())
        if not match:
            raise AQLParseError("Invalid FROM clause")
        shape = match.group(1)
        params_str = match.group(2)
        params = self._parse_params(params_str) if params_str else {}
        return shape, params

    def _parse_params(self, params_str: str) -> dict[str, Any]:
        params: dict[str, Any] = {}
        parts = self._split_outside_quotes(params_str, ",")
        for part in parts:
            if not part:
                continue
            key, _, raw = part.partition("=")
            if not raw:
                raise AQLParseError(f"Invalid parameter: {part}")
            params[key.strip()] = self._parse_value(raw.strip())
        return params

    def _parse_field_list(self, clause: Optional[str]) -> list[str]:
        if not clause:
            return []
        parts = self._split_outside_quotes(clause, ",")
        return [part.strip() for part in parts if part.strip()]

    def _parse_filters(self, clause: Optional[str]) -> list[AQLFilter]:
        if not clause:
            return []
        parts = self._split_and(clause)
        filters: list[AQLFilter] = []
        for part in parts:
            if not part:
                continue
            match = re.match(r"^\s*([a-zA-Z_][\w]*)\s+(contains|in)\s+(.+)$", part, re.IGNORECASE)
            if match:
                field, op, raw_value = match.group(1), match.group(2).lower(), match.group(3)
                value = self._parse_value(raw_value.strip())
                filters.append(AQLFilter(field=field, op=op, value=value))
                continue
            match = re.match(r"^\s*([a-zA-Z_][\w]*)\s*(=|!=|>=|<=|>|<)\s*(.+)$", part)
            if not match:
                raise AQLParseError(f"Invalid filter condition: {part}")
            field, op, raw_value = match.group(1), match.group(2), match.group(3)
            value = self._parse_value(raw_value.strip())
            filters.append(AQLFilter(field=field, op=op, value=value))
        return filters

    def _parse_measures(self, clause: Optional[str]) -> list[AQLMeasure]:
        if not clause:
            return []
        parts = self._split_outside_quotes(clause, ",")
        measures: list[AQLMeasure] = []
        for part in parts:
            if not part:
                continue
            match = re.match(
                r"^\s*([a-zA-Z_][\w]*)\s*\(\s*([\w\*]*)\s*\)\s*(?:as\s+([a-zA-Z_][\w]*))?\s*$",
                part,
                re.IGNORECASE,
            )
            if not match:
                raise AQLParseError(f"Invalid measure: {part}")
            func = match.group(1).lower()
            field = match.group(2) or None
            alias = match.group(3) or self._default_measure_alias(func, field)
            measures.append(AQLMeasure(func=func, field=field, alias=alias))
        return measures

    def _parse_sort(self, clause: Optional[str]) -> Optional[AQLSort]:
        if not clause:
            return None
        parts = clause.split()
        field = parts[0].strip()
        direction = parts[1].lower() if len(parts) > 1 else "asc"
        if direction not in {"asc", "desc"}:
            raise AQLParseError("Sort direction must be asc or desc")
        return AQLSort(field=field, direction=direction)

    def _parse_limit(self, clause: Optional[str]) -> Optional[int]:
        if not clause:
            return None
        try:
            value = int(clause.strip())
        except ValueError as e:
            raise AQLParseError("Limit must be an integer") from e
        return value

    def _parse_value(self, raw: str) -> Any:
        if not raw:
            return ""
        if raw.lower().startswith("now()"):
            now_ms = int(time.time() * 1000)
            remainder = raw[5:].strip()
            if not remainder:
                return now_ms
            match = re.match(r"^([+-])\s*(\d+(?:\.\d+)?)$", remainder)
            if not match:
                raise AQLParseError(f"Invalid now() expression: {raw}")
            delta = float(match.group(2))
            if match.group(1) == "-":
                delta = -delta
            return now_ms + int(delta)

        if raw[0] in {"'", '"'} and raw[-1] == raw[0]:
            return raw[1:-1]

        if raw.startswith("[") and raw.endswith("]"):
            inner = raw[1:-1]
            return [self._parse_value(item.strip()) for item in self._split_outside_quotes(inner, ",") if item.strip()]

        if raw.startswith("(") and raw.endswith(")"):
            inner = raw[1:-1]
            return [self._parse_value(item.strip()) for item in self._split_outside_quotes(inner, ",") if item.strip()]

        lowered = raw.lower()
        if lowered in {"true", "false"}:
            return lowered == "true"

        if re.match(r"^-?\d+\.\d+$", raw):
            return float(raw)
        if re.match(r"^-?\d+$", raw):
            return int(raw)

        return raw

    def _format_literal(self, value: Any, field_type: str, op: Optional[str] = None) -> str:
        if op == "in":
            if isinstance(value, (list, tuple)):
                items = value
            elif isinstance(value, str):
                raw = value.strip()
                if raw.startswith("(") or raw.startswith("["):
                    return raw
                items = [part.strip() for part in raw.split(",") if part.strip()]
            else:
                items = [value]
            formatted = ", ".join(self._format_literal(item, field_type) for item in items)
            return f"({formatted})"

        if isinstance(value, bool):
            return "true" if value else "false"

        if isinstance(value, (int, float)):
            return str(value)

        if isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                return "\"\""
            if stripped.lower().startswith("now()"):
                return stripped
            if field_type == "number":
                try:
                    num = float(stripped)
                    return str(int(num)) if num.is_integer() else str(num)
                except ValueError:
                    pass
            if stripped.lower() in {"true", "false"}:
                return stripped.lower()
            escaped = stripped.replace("\\", "\\\\").replace('"', '\\"')
            return f"\"{escaped}\""

        return f"\"{str(value)}\""

    def _split_outside_quotes(self, value: str, sep: str) -> list[str]:
        parts: list[str] = []
        buf: list[str] = []
        in_quote: Optional[str] = None
        i = 0
        while i < len(value):
            ch = value[i]
            if ch in {"'", '"'} and (i == 0 or value[i - 1] != "\\"):
                if in_quote == ch:
                    in_quote = None
                elif in_quote is None:
                    in_quote = ch
            if in_quote is None and value[i : i + len(sep)] == sep:
                parts.append("".join(buf).strip())
                buf = []
                i += len(sep)
                continue
            buf.append(ch)
            i += 1
        if buf:
            parts.append("".join(buf).strip())
        return parts

    def _split_and(self, value: str) -> list[str]:
        parts: list[str] = []
        buf: list[str] = []
        in_quote: Optional[str] = None
        i = 0
        while i < len(value):
            ch = value[i]
            if ch in {"'", '"'} and (i == 0 or value[i - 1] != "\\"):
                if in_quote == ch:
                    in_quote = None
                elif in_quote is None:
                    in_quote = ch
            if in_quote is None and value[i : i + 3].lower() == "and":
                before = value[i - 1] if i > 0 else " "
                after = value[i + 3] if i + 3 < len(value) else " "
                if before.isspace() and after.isspace():
                    parts.append("".join(buf).strip())
                    buf = []
                    i += 3
                    continue
            buf.append(ch)
            i += 1
        if buf:
            parts.append("".join(buf).strip())
        return parts

    def _apply_filter(self, stmt, col, filt: AQLFilter):
        if filt.op == "=":
            return stmt.where(col == filt.value)
        if filt.op == "!=":
            return stmt.where(col != filt.value)
        if filt.op == ">":
            return stmt.where(col > filt.value)
        if filt.op == ">=":
            return stmt.where(col >= filt.value)
        if filt.op == "<":
            return stmt.where(col < filt.value)
        if filt.op == "<=":
            return stmt.where(col <= filt.value)
        if filt.op == "contains":
            return stmt.where(col.contains(filt.value))
        if filt.op == "in":
            values = filt.value if isinstance(filt.value, list) else [filt.value]
            return stmt.where(col.in_(values))
        raise AQLParseError(f"Unsupported operator '{filt.op}'")

    def _default_sort(self, shape: dict) -> Optional[AQLSort]:
        default_sort = shape.get("default_sort")
        if not default_sort:
            return None
        return AQLSort(field=default_sort[0], direction=default_sort[1])

    def _build_base_stmt(self, shape: dict):
        base_stmt = shape.get("base_stmt")
        if base_stmt:
            return base_stmt()
        return select(shape["model"])

    def _with_selected_columns(self, stmt, fields: dict, field_names: list[str]):
        columns = []
        for name in field_names:
            col = fields.get(name)
            if col is None:
                continue
            columns.append(col.label(name))
        if not columns:
            return stmt
        return stmt.with_only_columns(*columns)

    def _required_fields_for_aggregate(self, query: AQLQuery, fields: dict) -> list[str]:
        required: list[str] = []
        for dim in query.dimensions:
            if dim in fields and dim not in required:
                required.append(dim)
        for measure in query.measures:
            if not measure.field or measure.field == "*":
                continue
            if measure.field in fields and measure.field not in required:
                required.append(measure.field)
        if not required and fields:
            required.append(next(iter(fields.keys())))
        return required

    def _resolve_select_fields(self, select_fields: list[str], fields: dict) -> list[str]:
        if not select_fields or "*" in select_fields:
            return list(fields.keys())
        return [field for field in select_fields if field in fields]

    def _default_measure_alias(self, func: str, field: Optional[str]) -> str:
        if not field or field == "*":
            return f"{func}_all"
        return f"{func}_{field}"

    def _aggregate_rows(self, records: list[Any], query: AQLQuery, fields: dict) -> list[dict[str, Any]]:
        dimensions = [dim for dim in query.dimensions if dim in fields]
        measures = query.measures
        grouped: dict[tuple, list[Any]] = {}
        if dimensions:
            for record in records:
                key = tuple(self._get_record_value(record, dim) for dim in dimensions)
                grouped.setdefault(key, []).append(record)
        else:
            grouped[tuple()] = records

        rows: list[dict[str, Any]] = []
        for key, rows_in_group in grouped.items():
            row: dict[str, Any] = {}
            for idx, dim in enumerate(dimensions):
                row[dim] = key[idx]
            for measure in measures:
                row[measure.alias] = self._compute_measure(rows_in_group, measure)
            rows.append(row)
        return rows

    def _compute_measure(self, records: list[Any], measure: AQLMeasure) -> Optional[float]:
        func = measure.func
        field = measure.field
        values: list[float] = []

        if func == "count":
            if not field or field == "*":
                return float(len(records))
            for record in records:
                if self._get_record_value(record, field) is not None:
                    values.append(1.0)
            return float(len(values))

        for record in records:
            value = self._get_record_value(record, field) if field else None
            if isinstance(value, (int, float)):
                values.append(float(value))

        if not values:
            return None

        if func == "sum":
            return float(sum(values))
        if func == "avg":
            return float(sum(values) / len(values))
        if func == "min":
            return float(min(values))
        if func == "max":
            return float(max(values))
        if func == "p95":
            values.sort()
            idx = max(0, int(math.ceil(0.95 * (len(values) - 1))))
            return float(values[idx])

        raise AQLParseError(f"Unsupported measure function '{func}'")

    def _get_record_value(self, record: Any, field: str) -> Any:
        if isinstance(record, dict):
            return record.get(field)
        getter = getattr(record, "get", None)
        if callable(getter):
            return getter(field)
        return getattr(record, field, None)

    def _sort_rows(self, rows: list[dict[str, Any]], sort: Optional[AQLSort]) -> list[dict[str, Any]]:
        if not sort:
            return rows
        reverse = sort.direction == "desc"
        return sorted(rows, key=lambda r: r.get(sort.field), reverse=reverse)

    def _schema_for_query(self, query: AQLQuery, fields: dict) -> list[str]:
        if query.measures or query.dimensions:
            schema = [dim for dim in query.dimensions if dim in fields]
            schema.extend([measure.alias for measure in query.measures])
            return schema
        return self._resolve_select_fields(query.select_fields, fields)
