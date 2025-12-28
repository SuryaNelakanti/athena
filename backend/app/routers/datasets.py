from fastapi import APIRouter, Depends, HTTPException
from typing import Any, List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select
from pydantic import BaseModel
import uuid

from ..database import get_session
from ..models import DatasetModel, DatasetRowModel, DatasetVersionModel
from ..services.dataset_service import DatasetService
from ..services.trace_service import extract_trace_io


# Request body for promote endpoint
class PromoteRequest(BaseModel):
    corrected_expected: Optional[dict] = None
    example_type: Optional[str] = "gold"
    row_kind: Optional[str] = None
    eval_label: Optional[str] = None


class DatasetCounts(BaseModel):
    total: int
    eval: int
    resource: int


class DatasetResponse(BaseModel):
    id: str
    project_id: str
    name: str
    description: Optional[str] = None
    version: int
    kind: str = "eval"
    schema: dict = {}
    schema_version: int = 1
    review_policy: dict = {}
    created_at: int
    row_counts: DatasetCounts

    class Config:
        from_attributes = True


class DatasetCreate(BaseModel):
    id: Optional[str] = None
    project_id: str
    name: str
    description: Optional[str] = None
    kind: Optional[str] = None
    schema: Optional[dict] = None
    schema_version: Optional[int] = None
    review_policy: Optional[dict] = None


class DatasetRowCreate(BaseModel):
    input: Any
    expected: Optional[Any] = None
    meta: Optional[dict] = None
    example_type: Optional[str] = None
    row_kind: Optional[str] = None
    eval_label: Optional[str] = None


class DatasetRowUpdate(BaseModel):
    input: Optional[Any] = None
    expected: Optional[Any] = None
    meta: Optional[dict] = None
    example_type: Optional[str] = None
    row_kind: Optional[str] = None
    eval_label: Optional[str] = None
    is_deleted: Optional[bool] = None
    reason: Optional[str] = None


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
            DatasetResponse(
                id=dataset.id,
                project_id=dataset.project_id,
                name=dataset.name,
                description=dataset.description,
                version=dataset.version,
                kind=dataset.kind,
                schema=dataset.schema or {},
                schema_version=dataset.schema_version,
                review_policy=dataset.review_policy or {},
                created_at=dataset.created_at,
                row_counts=DatasetCounts(**counts),
            )
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
    return DatasetResponse(
        id=dataset.id,
        project_id=dataset.project_id,
        name=dataset.name,
        description=dataset.description,
        version=dataset.version,
        kind=dataset.kind,
        schema=dataset.schema or {},
        schema_version=dataset.schema_version,
        review_policy=dataset.review_policy or {},
        created_at=dataset.created_at,
        row_counts=DatasetCounts(total=0, eval=0, resource=0),
    )

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
    return DatasetResponse(
        id=dataset.id,
        project_id=dataset.project_id,
        name=dataset.name,
        description=dataset.description,
        version=dataset.version,
        kind=dataset.kind,
        schema=dataset.schema or {},
        schema_version=dataset.schema_version,
        review_policy=dataset.review_policy or {},
        created_at=dataset.created_at,
        row_counts=DatasetCounts(**counts),
    )

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
    row_kind = body.row_kind if body else None
    eval_label = body.eval_label if body else None

    # Get the dataset
    dataset = await session.get(DatasetModel, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail=f"Dataset {dataset_id} not found")

    try:
        input_data, output_data, input_span_id, output_span_id = await extract_trace_io(
            session,
            trace_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    # For expected: use corrected_expected if provided, otherwise use raw output
    expected_data = corrected_expected if corrected_expected is not None else output_data

    service = DatasetService(session)
    try:
        return await service.add_row(
            dataset_id=dataset_id,
            input_data=input_data,
            expected_data=expected_data,
            meta={
                "promoted_from_trace": True,
                "input_span_id": input_span_id,
                "output_span_id": output_span_id,
            },
            example_type=example_type,
            row_kind=row_kind,
            eval_label=eval_label,
            source_trace_id=trace_id,
            version_meta={
                "source": "trace",
                "trace_id": trace_id,
                "input_span_id": input_span_id,
                "output_span_id": output_span_id,
            },
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

