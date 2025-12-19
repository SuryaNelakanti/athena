from fastapi import APIRouter, Depends, HTTPException, Body
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select
from pydantic import BaseModel
import uuid
import time

from ..database import get_session
from ..models import DatasetModel, DatasetRowModel


# Request body for promote endpoint
class PromoteRequest(BaseModel):
    corrected_expected: Optional[dict] = None
    example_type: str = "gold"


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
    from sqlalchemy import func
    
    # Get the dataset to check its current version
    dataset = await session.get(DatasetModel, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    
    # Subquery to get max version per logical_id
    # If at_version is specified, consider only rows created up to that point
    subquery = (
        select(
            DatasetRowModel.logical_id,
            func.max(DatasetRowModel.version).label("max_version")
        )
        .where(DatasetRowModel.dataset_id == dataset_id)
    )
    
    if at_version is not None:
        subquery = subquery.where(DatasetRowModel.version <= at_version)
    
    subquery = subquery.group_by(DatasetRowModel.logical_id).subquery()
    
    # Main query: join with subquery to get latest version of each logical row
    statement = (
        select(DatasetRowModel)
        .where(DatasetRowModel.dataset_id == dataset_id)
        .where(DatasetRowModel.is_deleted == False)  # Exclude tombstones
        .join(
            subquery,
            (DatasetRowModel.logical_id == subquery.c.logical_id) &
            (DatasetRowModel.version == subquery.c.max_version)
        )
        .order_by(DatasetRowModel.created_at.desc())
    )
    
    result = await session.execute(statement)
    return result.scalars().all()


@router.post("/{dataset_id}/rows", response_model=DatasetRowModel)
async def add_dataset_row(
    dataset_id: str,
    row: DatasetRowModel,
    session: AsyncSession = Depends(get_session)
):
    """
    Add a new row to a dataset.
    
    For new rows: generates logical_id and sets version=1.
    """
    # Verify dataset exists
    dataset = await session.get(DatasetModel, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    
    # Generate IDs for new row
    if not row.id:
        row.id = f"dr_{uuid.uuid4().hex[:8]}"
    
    # Generate logical_id for new row (first revision)
    if not hasattr(row, 'logical_id') or not row.logical_id:
        row.logical_id = f"drl_{uuid.uuid4().hex[:8]}"
    
    row.dataset_id = dataset_id
    row.version = 1
    row.is_deleted = False
    
    # Increment dataset version to track this change
    dataset.version += 1
    
    session.add(row)
    session.add(dataset)
    await session.commit()
    await session.refresh(row)
    return row


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
    
    # Create the dataset row with versioning fields
    row = DatasetRowModel(
        id=f"dr_{uuid.uuid4().hex[:8]}",
        dataset_id=dataset_id,
        logical_id=f"drl_{uuid.uuid4().hex[:8]}",  # New logical row
        version=1,
        is_deleted=False,
        input=input_data,
        expected=expected_data,
        meta={"promoted_from_trace": True},
        example_type=example_type,
        source_trace_id=trace_id,
        created_at=int(time.time() * 1000)
    )
    
    # Increment dataset version
    dataset.version += 1
    
    session.add(row)
    session.add(dataset)
    await session.commit()
    await session.refresh(row)
    return row

