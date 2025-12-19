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
    corrected_expected: Optional[dict] = None,  # If provided, use this instead of trace output
    example_type: str = "gold",  # "gold" or "anti_pattern"
    session: AsyncSession = Depends(get_session)
):
    """
    Promote a trace to a dataset row.
    
    - If corrected_expected is provided, use it as the expected output instead of the trace's actual output.
    - If example_type is "anti_pattern", this marks the trace output as something to avoid.
    """
    from ..services.proxy_service import ProxyService
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
    
    # Create the dataset row
    row = DatasetRowModel(
        id=f"dr_{uuid.uuid4().hex[:8]}",
        dataset_id=dataset_id,
        input=input_data,
        expected=expected_data,
        meta={"promoted_from_trace": True},
        example_type=example_type,
        source_trace_id=trace_id,
        created_at=int(time.time() * 1000)
    )
    
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return row

