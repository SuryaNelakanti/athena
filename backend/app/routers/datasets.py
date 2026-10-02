from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select
import uuid

from ..database import get_session
from ..models import DatasetModel, DatasetRowModel, DatasetVersionModel as DatasetVersionModel
from ..schemas.datasets import (
    DatasetCounts as DatasetCounts,
    DatasetCreate,
    DatasetResponse,
    DatasetRowCreate,
    DatasetRowUpdate,
)
from ..services.dataset_service import DatasetService
from ..services.dataset_response import build_dataset_response
from .dataset_promotions import router as dataset_promotions_router
from .dataset_history_routes import (
    flush_dataset,
    list_dataset_history,
    list_row_history,
    router as dataset_history_router,
)


router = APIRouter(prefix="/datasets", tags=["datasets"])


@router.get("/", response_model=List[DatasetResponse])
async def list_datasets(
    project_id: str,
    session: AsyncSession = Depends(get_session)
):
    statement = select(DatasetModel).where(DatasetModel.project_id == project_id)
    result = await session.execute(statement)
    datasets = result.scalars().all()
    service = DatasetService(session)
    responses: List[DatasetResponse] = []
    for dataset in datasets:
        counts = await service.get_row_counts(dataset.id)
        responses.append(
            build_dataset_response(dataset, counts)
        )
    return responses

@router.post("/", response_model=DatasetResponse)
async def create_dataset(
    payload: DatasetCreate,
    session: AsyncSession = Depends(get_session)
):
    # Check for unique name in project
    statement = select(DatasetModel).where(
        DatasetModel.project_id == payload.project_id,
        DatasetModel.name == payload.name
    )
    existing = await session.execute(statement)
    if existing.scalars().first():
        raise HTTPException(status_code=400, detail=f"Dataset with name '{payload.name}' already exists in this project")

    dataset = DatasetModel(
        id=payload.id or f"ds_{uuid.uuid4().hex[:8]}",
        project_id=payload.project_id,
        name=payload.name,
        description=payload.description,
        kind=payload.kind or "eval",
        schema=payload.schema or {},
        schema_version=payload.schema_version or 1,
        review_policy=payload.review_policy or {},
    )
    session.add(dataset)
    await session.commit()
    await session.refresh(dataset)
    return build_dataset_response(dataset, {"total": 0, "eval": 0, "resource": 0})

@router.get("/{dataset_id}", response_model=DatasetResponse)
async def get_dataset(
    dataset_id: str,
    session: AsyncSession = Depends(get_session)
):
    dataset = await session.get(DatasetModel, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    service = DatasetService(session)
    counts = await service.get_row_counts(dataset.id)
    return build_dataset_response(dataset, counts)

@router.get("/{dataset_id}/rows", response_model=List[DatasetRowModel])
async def list_dataset_rows(
    dataset_id: str,
    at_version: Optional[int] = None,  # For historical queries (experiment freeze)
    row_kind: Optional[str] = None,
    eval_label: Optional[str] = None,
    session: AsyncSession = Depends(get_session)
):
    """
    List dataset rows, returning only the latest revision of each logical row.
    
    If at_version is specified, returns rows as they existed at that dataset version
    (for experiment reproducibility).
    """
    service = DatasetService(session)
    try:
        return await service.list_rows(
            dataset_id,
            at_version=at_version,
            row_kind=row_kind,
            eval_label=eval_label,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{dataset_id}/rows", response_model=DatasetRowModel)
async def add_dataset_row(
    dataset_id: str,
    row: DatasetRowCreate,
    session: AsyncSession = Depends(get_session)
):
    """
    Add a new row to a dataset.
    """
    service = DatasetService(session)
    try:
        return await service.add_row(
            dataset_id=dataset_id,
            input_data=row.input,
            expected_data=row.expected,
            meta=row.meta,
            example_type=row.example_type,
            row_kind=row.row_kind,
            eval_label=row.eval_label,
            version_meta={"source": "manual"},
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.patch("/{dataset_id}/rows/{row_id}", response_model=DatasetRowModel)
async def update_dataset_row(
    dataset_id: str,
    row_id: str,
    updates: DatasetRowUpdate,
    session: AsyncSession = Depends(get_session),
):
    service = DatasetService(session)
    try:
        return await service.update_row(
            dataset_id=dataset_id,
            row_id=row_id,
            input_data=updates.input,
            expected_data=updates.expected,
            meta=updates.meta,
            example_type=updates.example_type,
            row_kind=updates.row_kind,
            eval_label=updates.eval_label,
            is_deleted=updates.is_deleted,
            version_meta={"reason": updates.reason} if updates.reason else {},
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/{dataset_id}/rows/{row_id}", response_model=DatasetRowModel)
async def delete_dataset_row(
    dataset_id: str,
    row_id: str,
    reason: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
):
    service = DatasetService(session)
    try:
        return await service.delete_row(
            dataset_id=dataset_id,
            row_id=row_id,
            version_meta={"reason": reason} if reason else {},
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


router.include_router(dataset_history_router)
router.include_router(dataset_promotions_router)
