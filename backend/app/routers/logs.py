"""
Logs Router - Log ingestion and retrieval API endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional, Dict, Any
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
import uuid
import time

from app.database import get_session
from app.models import LogModel, LogLevel


router = APIRouter(prefix="/logs", tags=["logs"])


# --- Request/Response Schemas ---

class LogCreate(BaseModel):
    """Single log entry to create."""
    project_id: str
    level: str = "INFO"  # DEBUG, INFO, WARN, ERROR
    message: str
    timestamp: Optional[int] = None  # Unix ms, defaults to now
    trace_id: Optional[str] = None
    span_id: Optional[str] = None
    attributes: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = None


class LogBatchCreate(BaseModel):
    """Batch of log entries to create."""
    logs: List[LogCreate]


class LogResponse(BaseModel):
    id: str
    project_id: str
    level: str
    message: str
    timestamp: int
    trace_id: Optional[str] = None
    span_id: Optional[str] = None
    # Proxy call metrics
    latency_ms: Optional[float] = None
    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int] = None
    total_tokens: Optional[int] = None
    cost: Optional[float] = None
    model: Optional[str] = None
    provider: Optional[str] = None
    # Structured data
    attributes: Dict[str, Any] = {}
    log_metadata: Dict[str, Any] = {}
    created_at: int

    class Config:
        from_attributes = True



class LogBatchResponse(BaseModel):
    """Response for batch log creation."""
    status: str
    count: int
    log_ids: List[str]


# --- Endpoints ---

@router.post("", response_model=LogResponse, status_code=201)
async def create_log(
    log: LogCreate, 
    session: AsyncSession = Depends(get_session)
):
    """Create a single log entry."""
    log_id = f"log_{uuid.uuid4().hex[:16]}"
    timestamp = log.timestamp or int(time.time() * 1000)
    
    # Validate log level
    valid_levels = ["DEBUG", "INFO", "WARN", "ERROR"]
    level = log.level.upper()
    if level not in valid_levels:
        raise HTTPException(status_code=400, detail=f"Invalid log level. Must be one of: {valid_levels}")
    
    db_log = LogModel(
        id=log_id,
        project_id=log.project_id,
        level=level,
        message=log.message,
        timestamp=timestamp,
        trace_id=log.trace_id,
        span_id=log.span_id,
        attributes=log.attributes or {},
        log_metadata=log.metadata or {},
        created_at=int(time.time() * 1000)
    )
    
    session.add(db_log)
    await session.commit()
    await session.refresh(db_log)
    return db_log


@router.post("/batch", response_model=LogBatchResponse, status_code=201)
async def create_logs_batch(
    batch: LogBatchCreate, 
    session: AsyncSession = Depends(get_session)
):
    """Create multiple log entries in a single request (max 100)."""
    if len(batch.logs) > 100:
        raise HTTPException(status_code=400, detail="Batch size cannot exceed 100 logs")
    
    if len(batch.logs) == 0:
        raise HTTPException(status_code=400, detail="Batch must contain at least one log")
    
    valid_levels = ["DEBUG", "INFO", "WARN", "ERROR"]
    log_ids = []
    now = int(time.time() * 1000)
    
    for log in batch.logs:
        log_id = f"log_{uuid.uuid4().hex[:16]}"
        level = log.level.upper()
        
        if level not in valid_levels:
            raise HTTPException(
                status_code=400, 
                detail=f"Invalid log level '{log.level}'. Must be one of: {valid_levels}"
            )
        
        db_log = LogModel(
            id=log_id,
            project_id=log.project_id,
            level=level,
            message=log.message,
            timestamp=log.timestamp or now,
            trace_id=log.trace_id,
            span_id=log.span_id,
            attributes=log.attributes or {},
            log_metadata=log.metadata or {},
            created_at=now
        )
        session.add(db_log)
        log_ids.append(log_id)
    
    await session.commit()
    
    return LogBatchResponse(
        status="success",
        count=len(log_ids),
        log_ids=log_ids
    )


@router.get("/{project_id}", response_model=List[LogResponse])
async def get_project_logs(
    project_id: str,
    level: Optional[str] = None,
    trace_id: Optional[str] = None,
    search: Optional[str] = None,
    start_time: Optional[int] = None,
    end_time: Optional[int] = None,
    limit: int = Query(default=100, le=1000),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session)
):
    """Get logs for a project with optional filtering."""
    query = select(LogModel).where(LogModel.project_id == project_id)
    
    if level:
        query = query.where(LogModel.level == level.upper())
    
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
