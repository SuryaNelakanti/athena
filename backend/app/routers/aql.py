"""
AQL Router - Execute Athena Query Language queries.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Any, Optional, List
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.services.aql_service import AQLService, AQLParseError


router = APIRouter(prefix="/aql", tags=["aql"])


class AQLFilterRequest(BaseModel):
    field: str
    op: str
    value: Any


class AQLMeasureRequest(BaseModel):
    func: str
    field: Optional[str] = None
    alias: Optional[str] = None


class AQLSortRequest(BaseModel):
    field: str
    direction: Optional[str] = "asc"


class AQLBuilderRequest(BaseModel):
    shape: str
    params: Optional[dict[str, Any]] = None
    select: Optional[List[str]] = None
    filters: Optional[List[AQLFilterRequest]] = None
    dimensions: Optional[List[str]] = None
    measures: Optional[List[AQLMeasureRequest]] = None
    sort: Optional[AQLSortRequest] = None
    limit: Optional[int] = None


class AQLQueryRequest(BaseModel):
    query: Optional[str] = None
    builder: Optional[AQLBuilderRequest] = None


@router.post("/query")
async def run_query(
    payload: AQLQueryRequest,
    session: AsyncSession = Depends(get_session),
):
    service = AQLService()
    try:
        query_text: Optional[str] = None
        if payload.builder:
            builder_dict = payload.builder.model_dump(exclude_none=True)
            query_text = service.build_query_from_builder(builder_dict)
        elif payload.query:
            query_text = payload.query
        else:
            raise AQLParseError("Request must include query or builder")

        parsed = service.parse(query_text)
        result = await service.execute(session, parsed)
        result["query"] = query_text
        return result
    except AQLParseError as e:
        raise HTTPException(status_code=400, detail=str(e))
