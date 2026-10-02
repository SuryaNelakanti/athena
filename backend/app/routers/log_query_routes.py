from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.database import get_session
from app.models import LogModel
from app.schemas.logs import LogResponse

router = APIRouter()


@router.get("/{project_id}", response_model=List[LogResponse])
async def get_project_logs(
    project_id: str,
    level: Optional[str] = None,
    status: Optional[str] = None,
    event_type: Optional[str] = None,
    trace_id: Optional[str] = None,
    search: Optional[str] = None,
    start_time: Optional[int] = None,
    end_time: Optional[int] = None,
    limit: int = Query(default=100, le=1000),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
):
    """Get logs for a project with optional filtering."""
    query = select(LogModel).where(LogModel.project_id == project_id)

    if level:
        query = query.where(LogModel.level == level.upper())
    if status:
        query = query.where(LogModel.status == status.lower())
    if event_type:
        query = query.where(LogModel.event_type == event_type)
    if trace_id:
        query = query.where(LogModel.trace_id == trace_id)
    if start_time:
        query = query.where(LogModel.timestamp >= start_time)
    if end_time:
        query = query.where(LogModel.timestamp <= end_time)
    if search:
        query = query.where(LogModel.message.contains(search))

    query = query.order_by(LogModel.timestamp.desc()).offset(offset).limit(limit)
    result = await session.execute(query)
    return result.scalars().all()


@router.get("/id/{log_id}", response_model=LogResponse)
async def get_log(log_id: str, session: AsyncSession = Depends(get_session)):
    """Get a specific log entry by ID."""
    log = await session.get(LogModel, log_id)
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")
    return log


@router.delete("/id/{log_id}")
async def delete_log(log_id: str, session: AsyncSession = Depends(get_session)):
    """Delete a specific log entry."""
    log = await session.get(LogModel, log_id)
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")
    await session.delete(log)
    await session.commit()
    return {"status": "success", "message": f"Log {log_id} deleted"}
