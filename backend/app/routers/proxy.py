"""Compose proxy inference, observability feedback, and operational routes."""

from fastapi import APIRouter

from app.routers.proxy_completion_routes import chat_completions, router as completion_router
from app.routers.proxy_operation_routes import (
    clear_cache,
    get_cache_stats,
    list_models,
    router as operations_router,
    toggle_cache,
)
from app.routers.proxy_span_feedback_routes import (
    create_span_feedback,
    router as span_feedback_router,
    upsert_span_score,
)
from app.schemas.proxy_observability import SpanFeedbackRequest, SpanScoreRequest

router = APIRouter(prefix="/v1", tags=["proxy"])
router.include_router(completion_router)
router.include_router(span_feedback_router)
router.include_router(operations_router)

__all__ = [
    "SpanFeedbackRequest",
    "SpanScoreRequest",
    "chat_completions",
    "clear_cache",
    "create_span_feedback",
    "get_cache_stats",
    "list_models",
    "router",
    "toggle_cache",
    "upsert_span_score",
]
