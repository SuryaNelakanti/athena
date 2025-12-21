from fastapi import APIRouter, Depends, HTTPException
from typing import Any, List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select
from pydantic import BaseModel
import uuid

from ..database import get_session
from ..models import DatasetModel, DatasetRowModel, DatasetVersionModel
from ..services.dataset_service import DatasetService


# Request body for promote endpoint
class PromoteRequest(BaseModel):
    corrected_expected: Optional[dict] = None
    example_type: str = "gold"


class DatasetRowCreate(BaseModel):
    input: Any
    expected: Optional[Any] = None
    meta: Optional[dict] = None
    example_type: Optional[str] = "gold"


class DatasetRowUpdate(BaseModel):
    input: Optional[Any] = None
    expected: Optional[Any] = None
    meta: Optional[dict] = None
    example_type: Optional[str] = None
    is_deleted: Optional[bool] = None
    reason: Optional[str] = None


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
    at_version: Optional[int] = None,  # For historical queries (experiment freeze)
    session: AsyncSession = Depends(get_session)
):
    """
    List dataset rows, returning only the latest revision of each logical row.
    
    If at_version is specified, returns rows as they existed at that dataset version
    (for experiment reproducibility).
    """
    service = DatasetService(session)
    try:
        return await service.list_rows(dataset_id, at_version=at_version)
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
            example_type=row.example_type or "gold",
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


@router.post("/{dataset_id}/flush", response_model=DatasetVersionModel)
async def flush_dataset(
    dataset_id: str,
    reason: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
):
    service = DatasetService(session)
    try:
        return await service.flush(dataset_id=dataset_id, reason=reason)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{dataset_id}/history", response_model=List[DatasetVersionModel])
async def list_dataset_history(
    dataset_id: str,
    session: AsyncSession = Depends(get_session),
):
    service = DatasetService(session)
    try:
        return await service.list_dataset_versions(dataset_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{dataset_id}/rows/{logical_id}/history", response_model=List[DatasetRowModel])
async def list_row_history(
    dataset_id: str,
    logical_id: str,
    session: AsyncSession = Depends(get_session),
):
    service = DatasetService(session)
    try:
        return await service.list_row_history(dataset_id, logical_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/promote", response_model=DatasetRowModel)
async def promote_trace_to_dataset(
    trace_id: str,
    dataset_id: str,
    body: Optional[PromoteRequest] = None,
    session: AsyncSession = Depends(get_session)
):
    """
    Promote a trace to a dataset row.
    
    - If corrected_expected is provided (in request body), use it as the expected output.
    - If example_type is "anti_pattern", this marks the trace output as something to avoid.
    """
    # Extract from body if provided
    corrected_expected = body.corrected_expected if body else None
    example_type = body.example_type if body else "gold"

    from ..models import TraceModel, SpanModel

    
    # Get the trace
    trace = await session.get(TraceModel, trace_id)
    if not trace:
        raise HTTPException(status_code=404, detail=f"Trace {trace_id} not found")
    
    # Get the dataset
    dataset = await session.get(DatasetModel, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail=f"Dataset {dataset_id} not found")
    
    # Get spans to extract input/output
    stmt = select(SpanModel).where(SpanModel.trace_id == trace_id).order_by(SpanModel.start_time)
    result = await session.execute(stmt)
    spans = result.scalars().all()
    
    if not spans:
        raise HTTPException(status_code=400, detail="Trace has no spans")
    
    # Extract input from first span, output from last span
    first_span = spans[0]
    last_span = spans[-1]
    
    input_data = first_span.input or {}
    
    # For expected: use corrected_expected if provided, otherwise use last span's output
    if corrected_expected is not None:
        expected_data = corrected_expected
    else:
        output = last_span.output or {}
        # Try to extract the text output
        if isinstance(output, dict):
            if "output_text" in output:
                expected_data = {"answer": output["output_text"]}
            elif "value" in output:
                expected_data = {"answer": output["value"]}
            else:
                expected_data = output
        else:
            expected_data = {"answer": str(output)}
    
    service = DatasetService(session)
    try:
        return await service.add_row(
            dataset_id=dataset_id,
            input_data=input_data,
            expected_data=expected_data,
            meta={"promoted_from_trace": True},
            example_type=example_type,
            source_trace_id=trace_id,
            version_meta={"source": "trace", "trace_id": trace_id},
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

