from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_session
from ..models import McpTokenModel
from ..schemas.mcp_tools import AqlQueryRequest, InferSchemaRequest
from ..services.aql_service import AQLParseError, AQLService
from ..services.dataset_service import DatasetService
from .mcp_oauth import _require_mcp_token

router = APIRouter()


@router.post("/tools/infer_schema")
async def infer_schema(
    payload: InferSchemaRequest,
    session: AsyncSession = Depends(get_session),
    _: McpTokenModel = Depends(_require_mcp_token),
) -> dict[str, Any]:
    limit = max(1, min(payload.limit or 5, 50))
    if payload.dataset_id:
        dataset_service = DatasetService(session)
        rows = await dataset_service.list_rows(payload.dataset_id)
        sample = rows[:limit]
        schema_fields: set[str] = {
            "row_kind",
            "eval_label",
            "example_type",
            "source_trace_id",
        }
        for row in sample:
            if isinstance(row.input, dict):
                for key in row.input.keys():
                    schema_fields.add(f"input.{key}")
            if isinstance(row.expected, dict):
                for key in row.expected.keys():
                    schema_fields.add(f"expected.{key}")
            if isinstance(row.meta, dict):
                for key in row.meta.keys():
                    schema_fields.add(f"meta.{key}")
        return {
            "source": "dataset",
            "dataset_id": payload.dataset_id,
            "schema": sorted(schema_fields),
            "sample_rows": [
                {"input": row.input, "expected": row.expected, "meta": row.meta} for row in sample
            ],
        }

    if payload.aql_query:
        service = AQLService()
        try:
            parsed = service.parse(payload.aql_query)
            parsed.limit = parsed.limit or limit
            result = await service.execute(session, parsed)
            return {
                "source": "aql",
                "schema": result.get("schema", []),
                "rows": result.get("rows", [])[:limit],
            }
        except AQLParseError as error:
            raise HTTPException(status_code=400, detail=str(error))

    raise HTTPException(status_code=400, detail="dataset_id or aql_query is required")


@router.post("/tools/aql_query")
async def aql_query(
    payload: AqlQueryRequest,
    session: AsyncSession = Depends(get_session),
    _: McpTokenModel = Depends(_require_mcp_token),
) -> dict[str, Any]:
    service = AQLService()
    try:
        parsed = service.parse(payload.query)
        result = await service.execute(session, parsed)
        result["query"] = payload.query
        return result
    except AQLParseError as error:
        raise HTTPException(status_code=400, detail=str(error))
