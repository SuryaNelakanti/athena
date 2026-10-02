from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from ..database import get_session
from ..models import ExperimentRunModel, ExperimentVersionModel, McpTokenModel
from ..schemas.mcp_tools import SummarizeExperimentRequest
from .mcp_oauth import _require_mcp_token

router = APIRouter()


@router.post("/tools/summarize_experiment")
async def summarize_experiment(
    payload: SummarizeExperimentRequest,
    session: AsyncSession = Depends(get_session),
    _: McpTokenModel = Depends(_require_mcp_token),
) -> dict[str, Any]:
    run: Optional[ExperimentRunModel] = None
    if payload.run_id:
        run = await session.get(ExperimentRunModel, payload.run_id)
    elif payload.version_id:
        statement = (
            select(ExperimentRunModel)
            .where(ExperimentRunModel.experiment_version_id == payload.version_id)
            .order_by(ExperimentRunModel.created_at.desc())
            .limit(1)
        )
        result = await session.execute(statement)
        run = result.scalar_one_or_none()
    elif payload.experiment_id:
        statement = (
            select(ExperimentRunModel)
            .join(ExperimentVersionModel, ExperimentRunModel.experiment_version_id == ExperimentVersionModel.id)
            .where(ExperimentVersionModel.experiment_id == payload.experiment_id)
            .order_by(ExperimentRunModel.created_at.desc())
            .limit(1)
        )
        result = await session.execute(statement)
        run = result.scalar_one_or_none()

    if not run:
        raise HTTPException(status_code=404, detail="Experiment run not found")

    version = await session.get(ExperimentVersionModel, run.experiment_version_id)
    experiment_id = version.experiment_id if version else None

    return {
        "experiment_id": experiment_id,
        "version_id": run.experiment_version_id,
        "run_id": run.id,
        "status": run.status,
        "summary": run.summary or {},
        "created_at": run.created_at,
        "completed_at": run.completed_at,
    }
