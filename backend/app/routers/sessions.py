from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.routers.session_annotations import router as annotations_router
from app.routers.session_evals import router as evals_router
from app.routers.session_runs import router as runs_router
from app.schemas.sessions import (
    AgentRunResponse,
    AgentSessionDetailResponse,
    AgentSessionResponse,
    SessionEventResponse,
)
from app.services.session_query_service import SessionQueryService

router = APIRouter(tags=["sessions"])

@router.get("/sessions", response_model=List[AgentSessionResponse])
async def list_sessions(
    project_id: str = Query(..., description="Project ID"),
    agent_name: Optional[str] = None,
    env: Optional[str] = None,
    status: Optional[str] = None,
    start_time: Optional[int] = None,
    end_time: Optional[int] = None,
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
):
    service = SessionQueryService(session)
    return await service.list_sessions(
        project_id,
        agent_name=agent_name,
        env=env,
        status=status,
        start_time=start_time,
        end_time=end_time,
        limit=limit,
        offset=offset,
    )


@router.get("/sessions/{session_id}", response_model=AgentSessionDetailResponse)
async def get_session_detail(
    session_id: str,
    run_limit: int = Query(default=50, le=200),
    session: AsyncSession = Depends(get_session),
):
    detail = await SessionQueryService(session).get_session_detail(
        session_id,
        run_limit=run_limit,
    )
    if not detail:
        raise HTTPException(status_code=404, detail="Session not found")
    return detail


@router.get("/runs/{run_id}", response_model=AgentRunResponse)
async def get_run(run_id: str, session: AsyncSession = Depends(get_session)):
    run_response = await SessionQueryService(session).get_run(run_id)
    if not run_response:
        raise HTTPException(status_code=404, detail="Run not found")
    return run_response


@router.get(
    "/sessions/{session_id}/timeline",
    response_model=List[SessionEventResponse],
)
async def get_session_timeline(
    session_id: str,
    limit: int = Query(default=200, le=1000),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
):
    events = await SessionQueryService(session).get_session_timeline(
        session_id,
        limit=limit,
        offset=offset,
    )
    if events is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return events


router.include_router(annotations_router)
router.include_router(evals_router)
router.include_router(runs_router)
