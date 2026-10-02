"""Compose review queue and trace-derived review routes."""

from fastapi import APIRouter

from app.routers.review_catalog_routes import (
    create_review,
    get_review,
    list_reviews,
    router as catalog_router,
    update_review,
)
from app.routers.review_trace_routes import (
    create_review_from_trace,
    promote_review_to_dataset,
    router as trace_router,
)
from app.schemas.reviews import (
    ReviewFromTraceRequest,
    ReviewItemCreate,
    ReviewItemUpdate,
    ReviewPromoteRequest,
)

router = APIRouter(prefix="/reviews", tags=["reviews"])
router.include_router(catalog_router)
router.include_router(trace_router)

__all__ = [
    "ReviewFromTraceRequest",
    "ReviewItemCreate",
    "ReviewItemUpdate",
    "ReviewPromoteRequest",
    "create_review",
    "create_review_from_trace",
    "get_review",
    "list_reviews",
    "promote_review_to_dataset",
    "router",
    "update_review",
]
