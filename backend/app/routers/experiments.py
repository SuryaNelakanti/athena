from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select
from pydantic import BaseModel
import uuid
import time

from ..database import get_session
from ..models import ExperimentModel, ExperimentResultModel, ExperimentRunModel, ExperimentRunResultModel, ExperimentVersionModel, ModelRegistryModel, DatasetRowModel
from ..services.experiment_service import ExperimentService, RunConfig
from ..services.experiment_v2_service import ExperimentV2Service, VersionConfig
from ..services.job_worker import JobWorker

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
        job_id = (run.summary or {}).get("job_id")
        if job_id:
            background_tasks.add_task(JobWorker.process_job, job_id)
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


@router.get("/{experiment_id}/compare")
async def compare_runs(
    experiment_id: str,
    baseline_run_id: str,
    candidate_run_id: str,
    session: AsyncSession = Depends(get_session),
):
    def _output_text(result: Optional[ExperimentRunResultModel]) -> Optional[str]:
        if not result:
            return None
        output = result.output or {}
        if isinstance(output, dict):
            if isinstance(output.get("output_text"), str):
                return output.get("output_text")
            if isinstance(output.get("content"), str):
                return output.get("content")
        return str(output) if output else None

    def _numeric_delta(base: dict, cand: dict) -> dict:
        delta = {}
        for key in set(base.keys()) | set(cand.keys()):
            b_val = base.get(key)
            c_val = cand.get(key)
            if isinstance(b_val, (int, float)) and isinstance(c_val, (int, float)):
                delta[key] = c_val - b_val
        return delta

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

    base_stmt = select(ExperimentRunResultModel).where(ExperimentRunResultModel.run_id == baseline_run_id)
    cand_stmt = select(ExperimentRunResultModel).where(ExperimentRunResultModel.run_id == candidate_run_id)
    base_res = await session.execute(base_stmt)
    cand_res = await session.execute(cand_stmt)
    base_results = base_res.scalars().all()
    cand_results = cand_res.scalars().all()

    base_map = {r.dataset_row_id: r for r in base_results}
    cand_map = {r.dataset_row_id: r for r in cand_results}
    row_ids = set(base_map.keys()) | set(cand_map.keys())

    row_map = {}
    if row_ids:
        rows_stmt = select(DatasetRowModel).where(DatasetRowModel.id.in_(row_ids))
        rows_res = await session.execute(rows_stmt)
        row_map = {r.id: r for r in rows_res.scalars().all()}

    row_diffs = []
    for row_id in row_ids:
        base = base_map.get(row_id)
        cand = cand_map.get(row_id)
        base_scores = base.scores if base else {}
        cand_scores = cand.scores if cand else {}

        row = row_map.get(row_id)
        row_diffs.append(
            {
                "dataset_row_id": row_id,
                "logical_id": getattr(row, "logical_id", None),
                "input": row.input if row else None,
                "expected": row.expected if row else None,
                "baseline": {
                    "scores": base_scores,
                    "output_text": _output_text(base),
                    "latency_ms": base.latency_ms if base else None,
                },
                "candidate": {
                    "scores": cand_scores,
                    "output_text": _output_text(cand),
                    "latency_ms": cand.latency_ms if cand else None,
                },
                "delta_scores": _numeric_delta(base_scores, cand_scores),
            }
        )

    baseline_summary = baseline_run.summary or {}
    candidate_summary = candidate_run.summary or {}

    return {
        "baseline_run": baseline_run,
        "candidate_run": candidate_run,
        "delta_summary": _numeric_delta(baseline_summary, candidate_summary),
        "rows": row_diffs,
    }

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
