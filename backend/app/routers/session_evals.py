from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.database import get_session
from app.models import AgentSessionEvalModel
from app.schemas.sessions import SessionEvalCreate, SessionEvalResponse
from app.services.audit_service import log_create
from app.services.automation_service import AutomationService
from app.services.session_eval_service import SessionEvalService

router = APIRouter(tags=["sessions"])


@router.get("/sessions/{session_id}/evals", response_model=List[SessionEvalResponse])
async def list_session_evals(
    session_id: str,
    run_id: Optional[str] = None,
    limit: int = Query(default=20, le=100),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
):
    stmt = select(AgentSessionEvalModel).where(
        AgentSessionEvalModel.session_id == session_id
    )
    if run_id:
        stmt = stmt.where(AgentSessionEvalModel.run_id == run_id)
    stmt = (
        stmt.order_by(AgentSessionEvalModel.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    result = await session.execute(stmt)
    return result.scalars().all()


@router.get("/session-evals/{eval_id}", response_model=SessionEvalResponse)
async def get_session_eval(
    eval_id: str,
    session: AsyncSession = Depends(get_session),
):
    eval_record = await session.get(AgentSessionEvalModel, eval_id)
    if not eval_record:
        raise HTTPException(status_code=404, detail="Session eval not found")
    return eval_record


@router.post(
    "/sessions/{session_id}/evals",
    response_model=SessionEvalResponse,
    status_code=201,
)
async def create_session_eval(
    session_id: str,
    payload: SessionEvalCreate,
    session: AsyncSession = Depends(get_session),
):
    service = SessionEvalService(session)
    try:
        eval_model = await service.create_eval(
            session_id=session_id,
            run_id=payload.run_id,
            scorers=payload.scorers,
            rubric=payload.rubric,
            expected=payload.expected,
            input_override=payload.input,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    await log_create(
        session=session,
        entity_type="session_eval",
        entity_id=eval_model.id,
        entity_data={
            "session_id": session_id,
            "run_id": eval_model.run_id,
            "version": eval_model.version,
        },
        project_id=eval_model.project_id,
    )
    automation_service = AutomationService(session)
    await automation_service.evaluate_source(
        project_id=eval_model.project_id,
        source_type="session_eval",
        source_id=eval_model.id,
        source={
            "session_id": session_id,
            "run_id": eval_model.run_id,
            "status": "completed",
            "scores": eval_model.scores or {},
            "score": (eval_model.summary or {}).get("avg_score"),
        },
    )
    await session.commit()
    await session.refresh(eval_model)
    return eval_model
