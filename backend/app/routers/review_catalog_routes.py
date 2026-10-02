import time
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.database import get_session
from app.models import ReviewItemModel
from app.schemas.reviews import ReviewItemCreate, ReviewItemUpdate

router = APIRouter()


@router.get("/", response_model=List[ReviewItemModel])
async def list_reviews(
    project_id: str,
    status: Optional[str] = None,
    source_type: Optional[str] = None,
    limit: int = 200,
    offset: int = 0,
    session: AsyncSession = Depends(get_session),
):
    stmt = select(ReviewItemModel).where(ReviewItemModel.project_id == project_id)
    if status:
        stmt = stmt.where(ReviewItemModel.status == status)
    if source_type:
        stmt = stmt.where(ReviewItemModel.source_type == source_type)
    stmt = stmt.order_by(ReviewItemModel.created_at.desc()).offset(offset).limit(limit)
    res = await session.execute(stmt)
    return res.scalars().all()


@router.get("/{review_id}", response_model=ReviewItemModel)
async def get_review(
    review_id: str,
    session: AsyncSession = Depends(get_session),
):
    review = await session.get(ReviewItemModel, review_id)
    if not review:
        raise HTTPException(status_code=404, detail="Review item not found")
    return review


@router.post("/", response_model=ReviewItemModel)
async def create_review(
    payload: ReviewItemCreate,
    session: AsyncSession = Depends(get_session),
):
    review = ReviewItemModel(
        id=f"rev_{uuid.uuid4().hex[:10]}",
        org_id=payload.org_id,
        project_id=payload.project_id,
        source_type=payload.source_type,
        source_id=payload.source_id,
        status="open",
        priority=int(payload.priority or 0),
        labels=payload.labels or [],
        score=payload.score,
        notes=payload.notes,
        meta=payload.meta or {},
        created_at=int(time.time() * 1000),
        updated_at=int(time.time() * 1000),
    )
    session.add(review)
    await session.commit()
    await session.refresh(review)
    return review


@router.patch("/{review_id}", response_model=ReviewItemModel)
async def update_review(
    review_id: str,
    payload: ReviewItemUpdate,
    session: AsyncSession = Depends(get_session),
):
    review = await session.get(ReviewItemModel, review_id)
    if not review:
        raise HTTPException(status_code=404, detail="Review item not found")

    if payload.status is not None:
        review.status = payload.status
        if payload.status in {"resolved", "dismissed"}:
            review.resolved_at = int(time.time() * 1000)
    if payload.priority is not None:
        review.priority = int(payload.priority)
    if payload.labels is not None:
        review.labels = payload.labels
    if payload.score is not None:
        review.score = payload.score
    if payload.notes is not None:
        review.notes = payload.notes
    if payload.meta is not None:
        review.meta = payload.meta

    review.updated_at = int(time.time() * 1000)
    session.add(review)
    await session.commit()
    await session.refresh(review)
    return review
