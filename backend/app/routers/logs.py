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
from app.models import LogModel
from app.services.job_service import JobService


router = APIRouter(prefix="/logs", tags=["logs"])


# --- Request/Response Schemas ---

class LogCreate(BaseModel):
    """Single log entry to create."""
    project_id: str
    # Deprecated: level retained for backward compatibility.
    level: Optional[str] = None  # DEBUG, INFO, WARN, ERROR
    event_type: Optional[str] = None
    status: Optional[str] = None  # success | error
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
    level: Optional[str] = None
    event_type: Optional[str] = None
    status: Optional[str] = None
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

def _normalize_status(status: Optional[str], level: Optional[str]) -> str:
    if status:
        normalized = status.lower().strip()
        if normalized not in {"success", "error"}:
            raise HTTPException(status_code=400, detail="Invalid status. Must be success or error.")
        return normalized
    if level and level.upper() == "ERROR":
        return "error"
    return "success"


def _normalize_level(level: Optional[str], status: str) -> str:
    if level:
        return level.upper()
    return "ERROR" if status == "error" else "INFO"


def _should_enqueue_score(
    trace_id: Optional[str],
    span_id: Optional[str],
    metadata: Optional[Dict[str, Any]],
) -> bool:
    if not trace_id and not span_id:
        return False
    if isinstance(metadata, dict):
        cfg = metadata.get("online_scoring")
        if isinstance(cfg, dict) and cfg.get("enabled") is False:
            return False
    return True


# --- Endpoints ---

@router.post("", response_model=LogResponse, status_code=201)
async def create_log(
    log: LogCreate, 
    session: AsyncSession = Depends(get_session)
):
    """Create a single log entry."""
    log_id = f"log_{uuid.uuid4().hex[:16]}"
    timestamp = log.timestamp or int(time.time() * 1000)

    status = _normalize_status(log.status, log.level)
    level = _normalize_level(log.level, status)
    event_type = (log.event_type or "custom").strip() or "custom"
    
    # Validate log level if provided (deprecated but supported)
    valid_levels = ["DEBUG", "INFO", "WARN", "ERROR"]
    if level not in valid_levels:
        raise HTTPException(status_code=400, detail=f"Invalid log level. Must be one of: {valid_levels}")
    
    db_log = LogModel(
        id=log_id,
        project_id=log.project_id,
        level=level,
        event_type=event_type,
        status=status,
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

    if _should_enqueue_score(db_log.trace_id, db_log.span_id, db_log.log_metadata):
        try:
            job_service = JobService(session)
            await job_service.create_job(kind="log_score", ref_id=db_log.id, payload={"source": "logs"})
        except Exception:
            pass
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
    
    log_ids = []
    now = int(time.time() * 1000)
    
    for log in batch.logs:
        log_id = f"log_{uuid.uuid4().hex[:16]}"
        status = _normalize_status(log.status, log.level)
        level = _normalize_level(log.level, status)
        event_type = (log.event_type or "custom").strip() or "custom"
        valid_levels = ["DEBUG", "INFO", "WARN", "ERROR"]
        if level not in valid_levels:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid log level '{log.level}'. Must be one of: {valid_levels}"
            )
        
        db_log = LogModel(
            id=log_id,
            project_id=log.project_id,
            level=level,
            event_type=event_type,
            status=status,
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

    for idx, log_id in enumerate(log_ids):
        log = batch.logs[idx]
        if not _should_enqueue_score(log.trace_id, log.span_id, log.metadata):
            continue
        try:
            job_service = JobService(session)
            await job_service.create_job(kind="log_score", ref_id=log_id, payload={"source": "logs"})
        except Exception:
            pass
    
    return LogBatchResponse(
        status="success",
        count=len(log_ids),
        log_ids=log_ids
    )


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
    session: AsyncSession = Depends(get_session)
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
