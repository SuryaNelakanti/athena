import uuid
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from ..database import get_session
from ..models import (
    DatasetRowModel,
    ExperimentModel,
    ExperimentResultModel,
    ExperimentRunModel,
    ExperimentRunResultModel,
    ExperimentVersionModel,
)
from ..services.experiment_service import ExperimentService, RunConfig
from ..services.experiment_comparison_service import build_experiment_comparison
from .experiment_errors import raise_internal_error as _raise_internal_error
from .experiment_version_routes import (
    CreateVersionRequest,
    ScorerConfigRequest,
    cancel_run,
    create_run,
    create_version,
    get_run,
    get_version,
    list_run_results,
    list_runs,
    list_versions,
    router as version_run_router,
    set_main_version,
)

router = APIRouter(prefix="/experiments", tags=["experiments"])


class RunExperimentRequest(BaseModel):
    model: str
    provider: Optional[str] = None
    temperature: Optional[float] = 1.0
    max_tokens: Optional[int] = None
    system_prompt: Optional[str] = None
    clear_existing: bool = True


class CreateRunResponse(BaseModel):
    run: ExperimentRunModel

@router.get("/", response_model=List[ExperimentModel])
async def list_experiments(
    project_id: str,
    session: AsyncSession = Depends(get_session)
):
    statement = select(ExperimentModel).where(ExperimentModel.project_id == project_id)
    result = await session.execute(statement)
    return result.scalars().all()

@router.post("/", response_model=ExperimentModel)
async def create_experiment(
    experiment: ExperimentModel,
    session: AsyncSession = Depends(get_session)
):
    # Check for unique name in project
    statement = select(ExperimentModel).where(
        ExperimentModel.project_id == experiment.project_id,
        ExperimentModel.name == experiment.name
    )
    existing = await session.execute(statement)
    if existing.scalars().first():
        raise HTTPException(status_code=400, detail=f"Experiment with name '{experiment.name}' already exists in this project")

    if not experiment.id:
        experiment.id = f"exp_{uuid.uuid4().hex[:8]}"
    session.add(experiment)
    await session.commit()
    await session.refresh(experiment)
    return experiment

@router.get("/{experiment_id}", response_model=ExperimentModel)
async def get_experiment(
    experiment_id: str,
    session: AsyncSession = Depends(get_session)
):
    exp = await session.get(ExperimentModel, experiment_id)
    if not exp:
        raise HTTPException(status_code=404, detail="Experiment not found")
    return exp

@router.post("/{experiment_id}/run", response_model=ExperimentModel)
async def run_experiment(
    experiment_id: str,
    request: RunExperimentRequest,
    session: AsyncSession = Depends(get_session),
):
    # Legacy endpoint (kept for backwards compatibility with the current UI).
    service = ExperimentService(session)
    try:
        return await service.run_experiment(
            experiment_id,
            RunConfig(
                model=request.model,
                provider=request.provider,
                temperature=request.temperature,
                max_tokens=request.max_tokens,
                system_prompt=request.system_prompt,
                clear_existing=request.clear_existing,
            ),
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as error:
        _raise_internal_error("Experiment execution", error)


router.include_router(version_run_router)


@router.get("/{experiment_id}/compare")
async def compare_experiment_runs(
    experiment_id: str,
    baseline_run_id: str,
    candidate_run_id: str,
    session: AsyncSession = Depends(get_session),
):
    baseline_run = await session.get(ExperimentRunModel, baseline_run_id)
    candidate_run = await session.get(ExperimentRunModel, candidate_run_id)
    if not baseline_run or not candidate_run:
        raise HTTPException(status_code=404, detail="Run not found")

    baseline_version = await session.get(ExperimentVersionModel, baseline_run.experiment_version_id)
    candidate_version = await session.get(ExperimentVersionModel, candidate_run.experiment_version_id)
    if not baseline_version or not candidate_version:
        raise HTTPException(status_code=404, detail="Version not found")
    if baseline_version.experiment_id != experiment_id or candidate_version.experiment_id != experiment_id:
        raise HTTPException(status_code=400, detail="Runs do not belong to experiment")

    baseline_result_query = select(ExperimentRunResultModel).where(
        ExperimentRunResultModel.run_id == baseline_run_id
    )
    candidate_result_query = select(ExperimentRunResultModel).where(
        ExperimentRunResultModel.run_id == candidate_run_id
    )
    baseline_results = (await session.execute(baseline_result_query)).scalars().all()
    candidate_results = (await session.execute(candidate_result_query)).scalars().all()
    row_ids = {result.dataset_row_id for result in (*baseline_results, *candidate_results)}

    rows_by_id = {}
    if row_ids:
        row_query = select(DatasetRowModel).where(DatasetRowModel.id.in_(row_ids))
        rows = (await session.execute(row_query)).scalars().all()
        rows_by_id = {row.id: row for row in rows}

    return build_experiment_comparison(
        baseline_run=baseline_run,
        candidate_run=candidate_run,
        baseline_version=baseline_version,
        candidate_version=candidate_version,
        baseline_results=baseline_results,
        candidate_results=candidate_results,
        rows_by_id=rows_by_id,
    )


@router.get("/{experiment_id}/results", response_model=List[ExperimentResultModel])
async def list_experiment_results(
    experiment_id: str,
    session: AsyncSession = Depends(get_session)
):
    statement = select(ExperimentResultModel).where(ExperimentResultModel.experiment_id == experiment_id)
    result = await session.execute(statement)
    return result.scalars().all()

@router.post("/{experiment_id}/results", response_model=ExperimentResultModel)
async def add_experiment_result(
    experiment_id: str,
    result: ExperimentResultModel,
    session: AsyncSession = Depends(get_session)
):
    if not result.id:
        result.id = f"er_{uuid.uuid4().hex[:8]}"
    result.experiment_id = experiment_id
    session.add(result)
    await session.commit()
    await session.refresh(result)
    return result
