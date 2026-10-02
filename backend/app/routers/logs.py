"""Compose log ingestion and retrieval routes under the existing API path."""

from fastapi import APIRouter

from app.routers.log_ingestion_routes import (
    create_log,
    create_logs_batch,
    router as log_ingestion_router,
)
from app.routers.log_query_routes import (
    delete_log,
    get_log,
    get_project_logs,
    router as log_query_router,
)
from app.schemas.logs import LogBatchCreate, LogBatchResponse, LogCreate, LogResponse

router = APIRouter(prefix="/logs", tags=["logs"])
router.include_router(log_ingestion_router)
router.include_router(log_query_router)

__all__ = [
    "LogBatchCreate",
    "LogBatchResponse",
    "LogCreate",
    "LogResponse",
    "create_log",
    "create_logs_batch",
    "delete_log",
    "get_log",
    "get_project_logs",
    "router",
]
