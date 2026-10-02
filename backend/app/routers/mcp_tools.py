"""Compose the authenticated MCP tool routers under the stable /mcp prefix."""

from fastapi import APIRouter

from ..schemas.mcp_tools import (
    AqlQueryRequest as AqlQueryRequest,
    GeneratePermalinkRequest as GeneratePermalinkRequest,
    InferSchemaRequest as InferSchemaRequest,
    ListRecentObjectsRequest as ListRecentObjectsRequest,
    ResolveObjectRequest as ResolveObjectRequest,
    SearchDocsRequest as SearchDocsRequest,
    SummarizeExperimentRequest as SummarizeExperimentRequest,
)
from .mcp_documentation_tools import (
    list_tools as list_tools,
    router as documentation_tools_router,
    search_docs as search_docs,
)
from .mcp_experiment_tools import (
    router as experiment_tools_router,
    summarize_experiment as summarize_experiment,
)
from .mcp_object_tools import (
    _create_share_link as _create_share_link,
    generate_permalink as generate_permalink,
    list_recent_objects as list_recent_objects,
    resolve_object as resolve_object,
    router as object_tools_router,
)
from .mcp_query_tools import (
    aql_query as aql_query,
    infer_schema as infer_schema,
    router as query_tools_router,
)

tools_router = APIRouter(prefix="/mcp", tags=["mcp"])
tools_router.include_router(documentation_tools_router)
tools_router.include_router(object_tools_router)
tools_router.include_router(query_tools_router)
tools_router.include_router(experiment_tools_router)
