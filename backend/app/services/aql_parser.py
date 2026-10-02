from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional
import re

from app.services.aql_builder import build_query_from_builder as format_builder_query
from app.services.aql_shapes import SHAPES as AQL_SHAPES
from app.services.aql_errors import AQLParseError
from app.services.aql_values import AQLValueCodec


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


class AQLParser:
    SHAPES = AQL_SHAPES

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
        return format_builder_query(
            builder,
            shapes=self.SHAPES,
            default_measure_alias=self._default_measure_alias,
        )

    def _split_clauses(self, query: str) -> dict[str, str]:
        matches = self._find_unquoted_clause_keywords(query)
        if not matches:
            raise AQLParseError("Query must include a FROM clause")

        clauses: dict[str, str] = {}
        for idx, match in enumerate(matches):
            key = match.group(1).lower()
            start = match.end()
            end = matches[idx + 1].start() if idx + 1 < len(matches) else len(query)
            clauses[key] = query[start:end].strip()
        return clauses

    def _find_unquoted_clause_keywords(self, query: str) -> list[re.Match[str]]:
        matches: list[re.Match[str]] = []
        quote: Optional[str] = None
        index = 0

        while index < len(query):
            character = query[index]
            if character in {"'", '"'} and not self._is_escaped(query, index):
                if quote == character:
                    quote = None
                elif quote is None:
                    quote = character
                index += 1
                continue

            if quote is None:
                match = self.KEYWORD_PATTERN.match(query, index)
                if match:
                    matches.append(match)
                    index = match.end()
                    continue
            index += 1

        return matches

    def _is_escaped(self, value: str, index: int) -> bool:
        backslash_count = 0
        cursor = index - 1
        while cursor >= 0 and value[cursor] == "\\":
            backslash_count += 1
            cursor -= 1
        return backslash_count % 2 == 1

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
        parts = AQLValueCodec.split_outside_quotes(params_str, ",")
        for part in parts:
            if not part:
                continue
            key, _, raw = part.partition("=")
            if not raw:
                raise AQLParseError(f"Invalid parameter: {part}")
            params[key.strip()] = AQLValueCodec.parse(raw.strip())
        return params

    def _parse_field_list(self, clause: Optional[str]) -> list[str]:
        if not clause:
            return []
        parts = AQLValueCodec.split_outside_quotes(clause, ",")
        return [part.strip() for part in parts if part.strip()]

    def _parse_filters(self, clause: Optional[str]) -> list[AQLFilter]:
        if not clause:
            return []
        parts = AQLValueCodec.split_conjunction(clause)
        filters: list[AQLFilter] = []
        for part in parts:
            if not part:
                continue
            match = re.match(r"^\s*([a-zA-Z_][\w]*)\s+(contains|in)\s+(.+)$", part, re.IGNORECASE)
            if match:
                field, op, raw_value = match.group(1), match.group(2).lower(), match.group(3)
                value = AQLValueCodec.parse(raw_value.strip())
                filters.append(AQLFilter(field=field, op=op, value=value))
                continue
            match = re.match(r"^\s*([a-zA-Z_][\w]*)\s*(=|!=|>=|<=|>|<)\s*(.+)$", part)
            if not match:
                raise AQLParseError(f"Invalid filter condition: {part}")
            field, op, raw_value = match.group(1), match.group(2), match.group(3)
            value = AQLValueCodec.parse(raw_value.strip())
            filters.append(AQLFilter(field=field, op=op, value=value))
        return filters

    def _parse_measures(self, clause: Optional[str]) -> list[AQLMeasure]:
        if not clause:
            return []
        parts = AQLValueCodec.split_outside_quotes(clause, ",")
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

    def _default_measure_alias(self, func: str, field: Optional[str]) -> str:
        if not field or field == "*":
            return f"{func}_all"
        return f"{func}_{field}"
