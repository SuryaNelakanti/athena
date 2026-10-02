from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from ..models import McpTokenModel
from ..schemas.mcp_tools import SearchDocsRequest
from ..services.documentation_search import search_documentation
from .mcp_oauth import _require_mcp_token

router = APIRouter()


@router.get("/tools")
async def list_tools(_: McpTokenModel = Depends(_require_mcp_token)) -> dict[str, Any]:
    return {
        "tools": [
            "search_docs",
            "resolve_object",
            "list_recent_objects",
            "infer_schema",
            "aql_query",
            "summarize_experiment",
            "generate_permalink",
        ]
    }


@router.post("/tools/search_docs")
async def search_docs(
    payload: SearchDocsRequest,
    _: McpTokenModel = Depends(_require_mcp_token),
) -> dict[str, Any]:
    query = payload.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="query is required")
    limit = max(1, min(payload.limit or 8, 50))
    results = search_documentation(query, limit)
    return {"query": query, "count": len(results), "results": results}
