from __future__ import annotations

from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.services.aql_aggregation import AQLAggregationExecutor
from app.services.aql_errors import AQLParseError
from app.services.aql_parser import AQLParser, AQLQuery, AQLSort


class AQLService(AQLParser):
    def __init__(self) -> None:
        self.aggregation = AQLAggregationExecutor()

    async def execute(self, session: AsyncSession, query: AQLQuery) -> dict[str, Any]:
        shape = self.SHAPES.get(query.shape)
        if not shape:
            raise AQLParseError(f"Unknown shape '{query.shape}'")

        fields = shape["fields"]
        filter_fields = shape["filter_fields"]
        statement = self._build_base_stmt(shape)
        for param, column in shape.get("param_filters", {}).items():
            value = query.params.get(param)
            if value is None:
                raise AQLParseError(f"Missing {param} in FROM clause")
            statement = statement.where(column == value)

        for query_filter in query.filters:
            if query_filter.field not in filter_fields:
                raise AQLParseError(f"Field '{query_filter.field}' cannot be filtered")
            statement = self._apply_filter(
                statement,
                fields.get(query_filter.field),
                query_filter,
            )

        if query.measures or query.dimensions:
            data_rows = await self.aggregation.execute(
                session,
                statement,
                query,
                fields,
                shape.get("field_types", {}),
            )
        else:
            data_rows = await self._select_rows(session, statement, query, shape, fields)

        schema = list(data_rows[0].keys()) if data_rows else self._schema_for_query(query, fields)
        return {
            "shape": query.shape,
            "schema": schema,
            "data": data_rows,
        }

    async def _select_rows(
        self,
        session: AsyncSession,
        statement: Any,
        query: AQLQuery,
        shape: dict[str, Any],
        fields: dict[str, Any],
    ) -> list[dict[str, Any]]:
        select_fields = self._resolve_select_fields(query.select_fields, fields)
        statement = self._with_selected_columns(statement, fields, select_fields)
        sort = query.sort or self._default_sort(shape)
        if sort:
            column = fields.get(sort.field)
            if column is not None:
                statement = statement.order_by(
                    column.desc() if sort.direction == "desc" else column.asc()
                )
        if query.limit is not None:
            statement = statement.limit(query.limit)

        result = await session.execute(statement)
        return [
            {field: record.get(field) for field in select_fields}
            for record in result.mappings().all()
        ]

    def _apply_filter(self, statement: Any, column: Any, query_filter: Any) -> Any:
        if query_filter.op == "=":
            return statement.where(column == query_filter.value)
        if query_filter.op == "!=":
            return statement.where(column != query_filter.value)
        if query_filter.op == ">":
            return statement.where(column > query_filter.value)
        if query_filter.op == ">=":
            return statement.where(column >= query_filter.value)
        if query_filter.op == "<":
            return statement.where(column < query_filter.value)
        if query_filter.op == "<=":
            return statement.where(column <= query_filter.value)
        if query_filter.op == "contains":
            return statement.where(column.contains(query_filter.value))
        if query_filter.op == "in":
            values = query_filter.value if isinstance(query_filter.value, list) else [query_filter.value]
            return statement.where(column.in_(values))
        raise AQLParseError(f"Unsupported operator '{query_filter.op}'")

    def _default_sort(self, shape: dict[str, Any]) -> Optional[AQLSort]:
        default_sort = shape.get("default_sort")
        if not default_sort:
            return None
        return AQLSort(field=default_sort[0], direction=default_sort[1])

    def _build_base_stmt(self, shape: dict[str, Any]) -> Any:
        base_statement = shape.get("base_stmt")
        if base_statement:
            return base_statement()
        return select(shape["model"])

    def _with_selected_columns(
        self,
        statement: Any,
        fields: dict[str, Any],
        field_names: list[str],
    ) -> Any:
        columns = [
            fields[name].label(name)
            for name in field_names
            if fields.get(name) is not None
        ]
        if not columns:
            return statement
        return statement.with_only_columns(*columns)

    def _resolve_select_fields(self, select_fields: list[str], fields: dict[str, Any]) -> list[str]:
        if not select_fields or "*" in select_fields:
            return list(fields.keys())
        return [field for field in select_fields if field in fields]

    def _schema_for_query(self, query: AQLQuery, fields: dict[str, Any]) -> list[str]:
        if query.measures or query.dimensions:
            schema = [dimension for dimension in query.dimensions if dimension in fields]
            schema.extend(measure.alias for measure in query.measures)
            return schema
        return self._resolve_select_fields(query.select_fields, fields)
