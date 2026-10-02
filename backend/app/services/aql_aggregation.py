from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from decimal import Decimal
from numbers import Number
from typing import Any

from sqlalchemy import Float, Integer, Numeric, and_, func, literal, select, true
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.aql_errors import AQLParseError
from app.services.aql_parser import AQLMeasure, AQLQuery, AQLSort


@dataclass
class GroupedAggregation:
    dimensions: list[str]
    dimension_columns: list[Any]
    statement: Any
    measure_indexes: list[int]
    percentile_measures: list[tuple[int, Any]]


class AQLAggregationExecutor:
    """Compile AQL dimensions and measures into SQL aggregation queries."""

    async def execute(
        self,
        session: AsyncSession,
        statement: Any,
        query: AQLQuery,
        fields: Mapping[str, Any],
        field_types: Mapping[str, str],
    ) -> list[dict[str, Any]]:
        plan = self._build_grouped_query(statement, query, fields, field_types)
        from_clause, output_columns, value_columns = self._grouped_output_columns(
            plan,
            statement,
            query,
        )
        result_statement = select(*output_columns).select_from(from_clause)
        result_statement = self._apply_sort(result_statement, query.sort, value_columns)
        if query.limit is not None and query.limit >= 0:
            result_statement = result_statement.limit(query.limit)

        result = await session.execute(result_statement)
        return self._result_rows(result.mappings().all(), plan.dimensions, query)

    def _build_grouped_query(
        self,
        statement: Any,
        query: AQLQuery,
        fields: Mapping[str, Any],
        field_types: Mapping[str, str],
    ) -> GroupedAggregation:
        dimensions = list(dict.fromkeys(dim for dim in query.dimensions if dim in fields))
        dimension_columns = [fields[dimension] for dimension in dimensions]
        aggregate_expressions: list[Any] = []
        measure_indexes: list[int] = []
        percentile_measures: list[tuple[int, Any]] = []

        for index, measure in enumerate(query.measures):
            expression = self._aggregate_expression(measure, fields, field_types)
            if measure.func == "p95" and self._is_numeric_field(
                measure.field,
                fields,
                field_types,
            ):
                percentile_measures.append((index, fields[measure.field]))
                continue
            aggregate_expressions.append(expression.label(self._measure_column(index)))
            measure_indexes.append(index)

        grouped_columns = [column.label(name) for name, column in zip(dimensions, dimension_columns)]
        selected_columns = [*grouped_columns, *aggregate_expressions]
        if selected_columns:
            grouped_statement = statement.with_only_columns(
                *selected_columns,
                maintain_column_froms=True,
            )
            if dimension_columns:
                grouped_statement = grouped_statement.group_by(*dimension_columns)
        else:
            # A query containing only p95 measures needs one global anchor row.
            grouped_statement = select(func.count()).select_from(statement.subquery())

        return GroupedAggregation(
            dimensions=dimensions,
            dimension_columns=dimension_columns,
            statement=grouped_statement.subquery("aql_groups"),
            measure_indexes=measure_indexes,
            percentile_measures=percentile_measures,
        )

    def _grouped_output_columns(
        self,
        plan: GroupedAggregation,
        statement: Any,
        query: AQLQuery,
    ) -> tuple[Any, list[Any], dict[str, Any]]:
        grouped = plan.statement
        from_clause = grouped
        output_columns = [grouped.c[dimension] for dimension in plan.dimensions]
        output_columns.extend(
            grouped.c[self._measure_column(index)]
            for index in plan.measure_indexes
        )
        if not output_columns and not query.measures:
            output_columns.append(grouped.c[0])

        value_columns: dict[str, Any] = {
            dimension: grouped.c[dimension] for dimension in plan.dimensions
        }
        measure_value_columns = {
            index: grouped.c[self._measure_column(index)]
            for index in plan.measure_indexes
        }
        for index, column in plan.percentile_measures:
            percentile = self._percentile_statement(
                statement,
                plan.dimensions,
                plan.dimension_columns,
                column,
            ).subquery(f"aql_p95_{index}")
            if plan.dimensions:
                join_condition = and_(
                    *(
                        grouped.c[name].is_not_distinct_from(percentile.c[name])
                        for name in plan.dimensions
                    )
                )
                from_clause = from_clause.outerjoin(percentile, join_condition)
            else:
                from_clause = from_clause.join(percentile, true())

            value_column = percentile.c["_value"].label(self._measure_column(index))
            output_columns.append(value_column)
            measure_value_columns[index] = value_column

        for index, measure in enumerate(query.measures):
            value_columns[measure.alias] = measure_value_columns[index]
        return from_clause, output_columns, value_columns

    def _result_rows(
        self,
        records: list[Any],
        dimensions: list[str],
        query: AQLQuery,
    ) -> list[dict[str, Any]]:
        rows = []
        for record in records:
            row = {dimension: record.get(dimension) for dimension in dimensions}
            for index, measure in enumerate(query.measures):
                row[measure.alias] = self._numeric_result(
                    record.get(self._measure_column(index))
                )
            rows.append(row)

        # The legacy aggregate path used Python slicing for negative limits.
        if query.limit is not None and query.limit < 0:
            return rows[: query.limit]
        return rows

    def _aggregate_expression(
        self,
        measure: AQLMeasure,
        fields: Mapping[str, Any],
        field_types: Mapping[str, str],
    ) -> Any:
        func_name = measure.func
        field = measure.field
        if func_name == "count":
            if not field or field == "*":
                return func.count()
            return func.count(fields.get(field, literal(None)))

        if func_name not in {"sum", "avg", "min", "max", "p95"}:
            raise AQLParseError(f"Unsupported measure function '{func_name}'")
        if not self._is_numeric_field(field, fields, field_types):
            return func.max(literal(None))
        if func_name == "p95":
            # Valid p95 measures are evaluated in their own window query.
            return func.max(literal(None))

        column = fields[field]
        aggregate = {
            "sum": func.sum,
            "avg": func.avg,
            "min": func.min,
            "max": func.max,
        }[func_name]
        return aggregate(column)

    def _percentile_statement(
        self,
        statement: Any,
        dimensions: list[str],
        dimension_columns: list[Any],
        value_column: Any,
    ) -> Any:
        rank = func.row_number().over(
            partition_by=dimension_columns or None,
            order_by=value_column.asc(),
        )
        value_count = func.count(value_column).over(
            partition_by=dimension_columns or None,
        )
        ranked = statement.where(value_column.is_not(None)).with_only_columns(
            *(column.label(name) for name, column in zip(dimensions, dimension_columns)),
            value_column.label("_value"),
            rank.label("_rank"),
            value_count.label("_count"),
            maintain_column_froms=True,
        ).subquery("aql_ranked_values")

        selected_dimensions = [ranked.c[dimension] for dimension in dimensions]
        percentile_value = func.min(ranked.c["_value"]).label("_value")
        percentile = select(*selected_dimensions, percentile_value).where(
            ranked.c["_rank"] * 20 > ranked.c["_count"] * 19
        )
        if dimensions:
            percentile = percentile.group_by(*selected_dimensions)
        return percentile

    def _apply_sort(
        self,
        statement: Any,
        sort: AQLSort | None,
        value_columns: Mapping[str, Any],
    ) -> Any:
        if not sort:
            return statement
        column = value_columns.get(sort.field)
        if column is None:
            return statement
        return statement.order_by(column.desc() if sort.direction == "desc" else column.asc())

    def _is_numeric_field(
        self,
        field: str | None,
        fields: Mapping[str, Any],
        field_types: Mapping[str, str],
    ) -> bool:
        if not field or field == "*":
            return False
        column = fields.get(field)
        if column is None:
            return False
        if field_types.get(field) == "number":
            return True
        return isinstance(getattr(column, "type", None), (Integer, Float, Numeric))

    def _numeric_result(self, value: Any) -> float | None:
        if value is None:
            return None
        return float(value) if isinstance(value, (Decimal, Number)) else None

    def _measure_column(self, index: int) -> str:
        return f"_aql_measure_{index}"
