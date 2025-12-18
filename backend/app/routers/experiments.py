from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select
import uuid
import time

from ..database import get_session
from ..models import ExperimentModel, ExperimentResultModel

router = APIRouter(prefix="/experiments", tags=["experiments"])

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
