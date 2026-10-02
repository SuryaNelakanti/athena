from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_session
from ..models import (
    ExperimentModel,
    ExperimentRunModel,
    ExperimentRunResultModel,
    ExperimentVersionModel,
    ModelRegistryModel,
)
from ..services.experiment_v2_service import (
    ExperimentV2Service,
    ScorerConfig,
    VersionConfig,
)
from ..services.job_worker import JobWorker
from .experiment_errors import raise_internal_error


router = APIRouter()


class ScorerConfigRequest(BaseModel):
    """Scorer configuration with weight and threshold."""

    type: str
    weight: float = 1.0
    threshold: float = 0.8
    is_primary: bool = False


class CreateVersionRequest(BaseModel):
    parent_version_id: Optional[str] = None
    model_registry_id: str
    temperature: Optional[float] = 1.0
    max_tokens: Optional[int] = None
    top_p: Optional[float] = None
    frequency_penalty: Optional[float] = None
    presence_penalty: Optional[float] = None
    stop_sequences: Optional[List[str]] = None
    system_prompt: Optional[str] = ""
    prompt_template: Optional[str] = None
    reasoning_effort: Optional[str] = None
    json_mode: Optional[bool] = None
    seed: Optional[int] = None
    scorers: Optional[List[ScorerConfigRequest]] = None
    notes: Optional[str] = ""


@router.get("/{experiment_id}/versions", response_model=List[ExperimentVersionModel])
async def list_versions(
    experiment_id: str,
    session: AsyncSession = Depends(get_session),
):
    service = ExperimentV2Service(session)
    return await service.list_versions(experiment_id)


@router.get("/versions/{version_id}", response_model=ExperimentVersionModel)
async def get_version(
    version_id: str,
    session: AsyncSession = Depends(get_session),
):
    version = await session.get(ExperimentVersionModel, version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    return version


@router.post("/{experiment_id}/versions", response_model=ExperimentVersionModel)
async def create_version(
    experiment_id: str,
    request: CreateVersionRequest,
    session: AsyncSession = Depends(get_session),
):
    model_row = await session.get(ModelRegistryModel, request.model_registry_id)
    if not model_row or not model_row.enabled:
        raise HTTPException(status_code=400, detail="Invalid model_registry_id")

    stop_sequences = tuple(request.stop_sequences) if request.stop_sequences else None
    scorers = _build_scorer_configs(request.scorers)
    service = ExperimentV2Service(session)
    try:
        return await service.create_version(
            experiment_id,
            VersionConfig(
                parent_version_id=request.parent_version_id,
                model_registry_id=model_row.id,
                provider=model_row.provider,
                model_id=model_row.model_id,
                temperature=request.temperature if request.temperature is not None else 1.0,
                max_tokens=request.max_tokens,
                top_p=request.top_p,
                frequency_penalty=request.frequency_penalty,
                presence_penalty=request.presence_penalty,
                stop_sequences=stop_sequences,
                system_prompt=str(request.system_prompt or ""),
                prompt_template=request.prompt_template,
                reasoning_effort=request.reasoning_effort,
                json_mode=request.json_mode,
                seed=request.seed,
                scorers=scorers,
                notes=str(request.notes or ""),
            ),
        )
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error))
    except Exception as error:
        raise_internal_error("Experiment version creation", error)


def _build_scorer_configs(
    requested_scorers: Optional[List[ScorerConfigRequest]],
) -> tuple[ScorerConfig, ...]:
    if not requested_scorers:
        return (ScorerConfig(type="exact_match", weight=1.0, threshold=0.8, is_primary=True),)

    has_primary = any(scorer.is_primary for scorer in requested_scorers)
    primary_count = sum(1 for scorer in requested_scorers if scorer.is_primary)
    if primary_count > 1:
        raise HTTPException(status_code=400, detail="Only one primary scorer is allowed")

    return tuple(
        ScorerConfig(
            type=scorer.type,
            weight=scorer.weight,
            threshold=scorer.threshold,
            is_primary=scorer.is_primary if has_primary else index == 0,
        )
        for index, scorer in enumerate(requested_scorers)
    )


@router.post("/{experiment_id}/main", response_model=ExperimentModel)
async def set_main_version(
    experiment_id: str,
    version_id: str,
    session: AsyncSession = Depends(get_session),
):
    service = ExperimentV2Service(session)
    try:
        return await service.set_main_version(experiment_id, version_id)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error))
    except Exception as error:
        raise_internal_error("Main version update", error)


@router.post(
    "/{experiment_id}/versions/{version_id}/runs",
    response_model=ExperimentRunModel,
)
async def create_run(
    experiment_id: str,
    version_id: str,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
):
    version = await session.get(ExperimentVersionModel, version_id)
    if not version or version.experiment_id != experiment_id:
        raise HTTPException(status_code=404, detail="Version not found")

    service = ExperimentV2Service(session)
    try:
        run = await service.create_run(version_id)
        job_id = (run.summary or {}).get("job_id")
        if job_id:
            background_tasks.add_task(JobWorker.process_job, job_id)
        return run
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error))
    except Exception as error:
        raise_internal_error("Experiment run creation", error)


@router.get(
    "/{experiment_id}/versions/{version_id}/runs",
    response_model=List[ExperimentRunModel],
)
async def list_runs(
    experiment_id: str,
    version_id: str,
    session: AsyncSession = Depends(get_session),
):
    version = await session.get(ExperimentVersionModel, version_id)
    if not version or version.experiment_id != experiment_id:
        raise HTTPException(status_code=404, detail="Version not found")

    service = ExperimentV2Service(session)
    return await service.list_runs_for_version(version_id)


@router.get("/runs/{run_id}", response_model=ExperimentRunModel)
async def get_run(
    run_id: str,
    session: AsyncSession = Depends(get_session),
):
    service = ExperimentV2Service(session)
    try:
        return await service.get_run(run_id)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error))


@router.post("/runs/{run_id}/cancel", response_model=ExperimentRunModel)
async def cancel_run(
    run_id: str,
    session: AsyncSession = Depends(get_session),
):
    service = ExperimentV2Service(session)
    try:
        return await service.cancel_run(run_id)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error))


@router.get("/runs/{run_id}/results", response_model=List[ExperimentRunResultModel])
async def list_run_results(
    run_id: str,
    session: AsyncSession = Depends(get_session),
):
    service = ExperimentV2Service(session)
    try:
        return await service.list_run_results(run_id)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error))
