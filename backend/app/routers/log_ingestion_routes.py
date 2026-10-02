from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.schemas.logs import LogBatchCreate, LogBatchResponse, LogCreate, LogResponse
from app.services.log_ingestion import LogInputError, LogIngestionService

router = APIRouter()


@router.post("", response_model=LogResponse, status_code=201)
async def create_log(
    log: LogCreate,
    session: AsyncSession = Depends(get_session),
):
    """Create a single log entry."""
    try:
        return await LogIngestionService(session).create_log(log)
    except LogInputError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/batch", response_model=LogBatchResponse, status_code=201)
async def create_logs_batch(
    batch: LogBatchCreate,
    session: AsyncSession = Depends(get_session),
):
    """Create multiple log entries in a single request (max 100)."""
    if len(batch.logs) > 100:
        raise HTTPException(status_code=400, detail="Batch size cannot exceed 100 logs")
    if not batch.logs:
        raise HTTPException(status_code=400, detail="Batch must contain at least one log")

    try:
        logs = await LogIngestionService(session).create_logs_batch(batch.logs)
    except LogInputError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    log_ids = [log.id for log in logs]
    return LogBatchResponse(status="success", count=len(log_ids), log_ids=log_ids)
