from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select
from pydantic import BaseModel
import uuid
import time

from ..database import get_session
from ..models import ExperimentModel, ExperimentResultModel, ExperimentRunModel, ExperimentRunResultModel, ExperimentVersionModel, ModelRegistryModel
from ..services.experiment_service import ExperimentService, RunConfig
from ..services.experiment_v2_service import ExperimentV2Service, VersionConfig

router = APIRouter(prefix="/experiments", tags=["experiments"])


class RunExperimentRequest(BaseModel):
    model: str
    provider: Optional[str] = None
    temperature: Optional[float] = 1.0
    max_tokens: Optional[int] = None
    system_prompt: Optional[str] = None
    clear_existing: bool = True


class CreateVersionRequest(BaseModel):
    parent_version_id: Optional[str] = None
    model_registry_id: str
    # Core inference params
    temperature: Optional[float] = 1.0
    max_tokens: Optional[int] = None
    top_p: Optional[float] = None  # NEW
    frequency_penalty: Optional[float] = None  # NEW
    presence_penalty: Optional[float] = None  # NEW
    stop_sequences: Optional[List[str]] = None  # NEW
    # Prompt config
    system_prompt: Optional[str] = ""
    prompt_template: Optional[str] = None  # NEW - e.g. "Answer the following: {{input}}"
    # Advanced
    reasoning_effort: Optional[str] = None  # NEW - for o1/o3 models: "low" | "medium" | "high"
    json_mode: Optional[bool] = None  # NEW
    seed: Optional[int] = None  # NEW - for reproducibility
    # Scorers
    scorers: Optional[List[str]] = None  # NEW - list of scorer names e.g. ["exact_match", "contains"]
    # Metadata
    notes: Optional[str] = ""


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
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{experiment_id}/versions", response_model=List[ExperimentVersionModel])
async def list_versions(
    experiment_id: str,
    session: AsyncSession = Depends(get_session),
):
    service = ExperimentV2Service(session)
    return await service.list_versions(experiment_id)


@router.post("/{experiment_id}/versions", response_model=ExperimentVersionModel)
async def create_version(
    experiment_id: str,
    request: CreateVersionRequest,
    session: AsyncSession = Depends(get_session),
):
    model_row = await session.get(ModelRegistryModel, request.model_registry_id)
    if not model_row or not model_row.enabled:
        raise HTTPException(status_code=400, detail="Invalid model_registry_id")

    # Convert stop_sequences list to tuple for frozen dataclass
    stop_seq = tuple(request.stop_sequences) if request.stop_sequences else None
    # Convert scorers list to tuple, default to exact_match
    scorers = tuple(request.scorers) if request.scorers else ("exact_match",)

    service = ExperimentV2Service(session)
    try:
        return await service.create_version(
            experiment_id,
            VersionConfig(
                parent_version_id=request.parent_version_id,
                model_registry_id=model_row.id,
                provider=model_row.provider,
                model_id=model_row.model_id,
                temperature=float(request.temperature or 1.0),
                max_tokens=request.max_tokens,
                top_p=request.top_p,
                frequency_penalty=request.frequency_penalty,
                presence_penalty=request.presence_penalty,
                stop_sequences=stop_seq,
                system_prompt=str(request.system_prompt or ""),
                prompt_template=request.prompt_template,
                reasoning_effort=request.reasoning_effort,
                json_mode=request.json_mode,
                seed=request.seed,
                scorers=scorers,
                notes=str(request.notes or ""),
            ),
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{experiment_id}/main", response_model=ExperimentModel)
async def set_main_version(
    experiment_id: str,
    version_id: str,
    session: AsyncSession = Depends(get_session),
):
    service = ExperimentV2Service(session)
    try:
        return await service.set_main_version(experiment_id, version_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{experiment_id}/versions/{version_id}/runs", response_model=ExperimentRunModel)
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
        background_tasks.add_task(ExperimentV2Service.execute_run, run.id)
        return run
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{experiment_id}/versions/{version_id}/runs", response_model=List[ExperimentRunModel])
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
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/runs/{run_id}/cancel", response_model=ExperimentRunModel)
async def cancel_run(
    run_id: str,
    session: AsyncSession = Depends(get_session),
):
    service = ExperimentV2Service(session)
    try:
        return await service.cancel_run(run_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/runs/{run_id}/results", response_model=List[ExperimentRunResultModel])
async def list_run_results(
    run_id: str,
    session: AsyncSession = Depends(get_session),
):
    service = ExperimentV2Service(session)
    try:
        return await service.list_run_results(run_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

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
