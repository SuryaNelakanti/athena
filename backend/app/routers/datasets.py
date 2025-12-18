from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select
import uuid
import time

from ..database import get_session
from ..models import DatasetModel, DatasetRowModel

router = APIRouter(prefix="/datasets", tags=["datasets"])

@router.get("/", response_model=List[DatasetModel])
async def list_datasets(
    project_id: str,
    session: AsyncSession = Depends(get_session)
):
    statement = select(DatasetModel).where(DatasetModel.project_id == project_id)
    result = await session.execute(statement)
    return result.scalars().all()

@router.post("/", response_model=DatasetModel)
async def create_dataset(
    dataset: DatasetModel,
    session: AsyncSession = Depends(get_session)
):
    # Check for unique name in project
    statement = select(DatasetModel).where(
        DatasetModel.project_id == dataset.project_id,
        DatasetModel.name == dataset.name
    )
    existing = await session.execute(statement)
    if existing.scalars().first():
        raise HTTPException(status_code=400, detail=f"Dataset with name '{dataset.name}' already exists in this project")

    if not dataset.id:
        dataset.id = f"ds_{uuid.uuid4().hex[:8]}"
    session.add(dataset)
    await session.commit()
    await session.refresh(dataset)
    return dataset

@router.get("/{dataset_id}", response_model=DatasetModel)
async def get_dataset(
    dataset_id: str,
    session: AsyncSession = Depends(get_session)
):
    dataset = await session.get(DatasetModel, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return dataset

@router.get("/{dataset_id}/rows", response_model=List[DatasetRowModel])
async def list_dataset_rows(
    dataset_id: str,
    session: AsyncSession = Depends(get_session)
):
    statement = select(DatasetRowModel).where(DatasetRowModel.dataset_id == dataset_id)
    result = await session.execute(statement)
    return result.scalars().all()

@router.post("/{dataset_id}/rows", response_model=DatasetRowModel)
async def add_dataset_row(
    dataset_id: str,
    row: DatasetRowModel,
    session: AsyncSession = Depends(get_session)
):
    if not row.id:
        row.id = f"dr_{uuid.uuid4().hex[:8]}"
    row.dataset_id = dataset_id
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return row

@router.post("/promote", response_model=DatasetRowModel)
async def promote_trace_to_dataset(
    trace_id: str,
    dataset_id: str,
    session: AsyncSession = Depends(get_session)
):
    from ..services.proxy_service import ProxyService
    service = ProxyService(session)
    try:
        return await service.promote_to_dataset(trace_id, dataset_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
