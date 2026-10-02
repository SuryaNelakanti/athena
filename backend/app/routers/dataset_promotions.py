from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_session
from ..models import AgentRunModel, DatasetModel, DatasetRowModel
from ..services.dataset_service import DatasetService
from ..services.trace_service import extract_trace_io


class PromoteRequest(BaseModel):
    corrected_expected: Optional[dict] = None
    example_type: Optional[str] = "gold"
    row_kind: Optional[str] = None
    eval_label: Optional[str] = None


class PromoteFromRunRequest(BaseModel):
    run_id: str
    dataset_id: str
    label: Optional[str] = None
    note: Optional[str] = None


router = APIRouter()


@router.post("/promote", response_model=DatasetRowModel)
async def promote_trace_to_dataset(
    trace_id: str,
    dataset_id: str,
    body: Optional[PromoteRequest] = None,
    session: AsyncSession = Depends(get_session),
):
    """Promote a trace to a dataset row."""
    corrected_expected = body.corrected_expected if body else None
    example_type = body.example_type if body else "gold"
    row_kind = body.row_kind if body else None
    eval_label = body.eval_label if body else None

    dataset = await session.get(DatasetModel, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail=f"Dataset {dataset_id} not found")

    try:
        input_data, output_data, input_span_id, output_span_id = await extract_trace_io(
            session,
            trace_id,
        )
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error))

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
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error))


@router.post("/promote-from-run", response_model=DatasetRowModel)
async def promote_run_to_dataset(
    body: PromoteFromRunRequest,
    session: AsyncSession = Depends(get_session),
):
    """Promote an agent run with trace and run provenance."""
    run = await session.get(AgentRunModel, body.run_id)
    if not run:
        raise HTTPException(status_code=404, detail=f"Run {body.run_id} not found")
    if not run.trace_id:
        raise HTTPException(status_code=400, detail="Run has no associated trace")

    dataset = await session.get(DatasetModel, body.dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail=f"Dataset {body.dataset_id} not found")
    if run.project_id != dataset.project_id:
        raise HTTPException(status_code=400, detail="Run and dataset must belong to the same project")

    try:
        input_data, output_data, input_span_id, output_span_id = await extract_trace_io(
            session,
            run.trace_id,
        )
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error))

    eval_label = body.label if body.label in ("gold", "anti_pattern") else None
    example_type = body.label if body.label in ("gold", "anti_pattern") else "gold"
    service = DatasetService(session)
    try:
        return await service.add_row(
            dataset_id=body.dataset_id,
            input_data=input_data,
            expected_data=output_data,
            meta={
                "promoted_from_run": True,
                "run_id": body.run_id,
                "session_id": run.session_id,
                "input_span_id": input_span_id,
                "output_span_id": output_span_id,
                "note": body.note,
            },
            example_type=example_type,
            eval_label=eval_label,
            source_trace_id=run.trace_id,
            version_meta={
                "source": "run",
                "run_id": body.run_id,
                "trace_id": run.trace_id,
            },
        )
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error))
