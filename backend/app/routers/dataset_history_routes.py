from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_session
from ..models import DatasetRowModel, DatasetVersionModel
from ..services.dataset_service import DatasetService

router = APIRouter()


@router.post("/{dataset_id}/flush", response_model=DatasetVersionModel)
async def flush_dataset(
    dataset_id: str,
    reason: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
):
    service = DatasetService(session)
    try:
        return await service.flush(dataset_id=dataset_id, reason=reason)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error))


@router.get("/{dataset_id}/history", response_model=List[DatasetVersionModel])
async def list_dataset_history(
    dataset_id: str,
    session: AsyncSession = Depends(get_session),
):
    service = DatasetService(session)
    try:
        return await service.list_dataset_versions(dataset_id)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error))


@router.get("/{dataset_id}/rows/{logical_id}/history", response_model=List[DatasetRowModel])
async def list_row_history(
    dataset_id: str,
    logical_id: str,
    session: AsyncSession = Depends(get_session),
):
    service = DatasetService(session)
    try:
        return await service.list_row_history(dataset_id, logical_id)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error))
