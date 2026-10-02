from __future__ import annotations

import time
import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.database import get_session
from app.models import AgentSessionAnnotationModel, AgentSessionModel
from app.schemas.sessions import (
    SessionAnnotationCreate,
    SessionAnnotationResponse,
    SessionAnnotationUpdate,
)
from app.services.audit_service import log_create, log_update

router = APIRouter(tags=["sessions"])


def _now_ms() -> int:
    return int(time.time() * 1000)


@router.get(
    "/sessions/{session_id}/annotations",
    response_model=List[SessionAnnotationResponse],
)
async def list_session_annotations(
    session_id: str,
    session: AsyncSession = Depends(get_session),
):
    db_session = await session.get(AgentSessionModel, session_id)
    if not db_session:
        raise HTTPException(status_code=404, detail="Session not found")

    stmt = (
        select(AgentSessionAnnotationModel)
        .where(AgentSessionAnnotationModel.session_id == session_id)
        .order_by(AgentSessionAnnotationModel.created_at.desc())
    )
    result = await session.execute(stmt)
    return result.scalars().all()


@router.post(
    "/sessions/{session_id}/annotations",
    response_model=SessionAnnotationResponse,
    status_code=201,
)
async def create_session_annotation(
    session_id: str,
    payload: SessionAnnotationCreate,
    session: AsyncSession = Depends(get_session),
):
    db_session = await session.get(AgentSessionModel, session_id)
    if not db_session:
        raise HTTPException(status_code=404, detail="Session not found")

    now = _now_ms()
    annotation = AgentSessionAnnotationModel(
        id=f"ann_{uuid.uuid4().hex[:16]}",
        session_id=session_id,
        project_id=db_session.project_id,
        labels=payload.labels,
        severity=payload.severity,
        owner=payload.owner,
        status=payload.status,
        note=payload.note,
        created_at=now,
        updated_at=now,
    )
    session.add(annotation)
    await log_create(
        session=session,
        entity_type="session_annotation",
        entity_id=annotation.id,
        entity_data={
            "session_id": session_id,
            "project_id": db_session.project_id,
            "status": payload.status,
        },
        project_id=db_session.project_id,
    )
    await session.commit()
    await session.refresh(annotation)
    return annotation


@router.patch(
    "/sessions/annotations/{annotation_id}",
    response_model=SessionAnnotationResponse,
)
async def update_session_annotation(
    annotation_id: str,
    payload: SessionAnnotationUpdate,
    session: AsyncSession = Depends(get_session),
):
    annotation = await session.get(AgentSessionAnnotationModel, annotation_id)
    if not annotation:
        raise HTTPException(status_code=404, detail="Annotation not found")

    before = {
        "labels": annotation.labels,
        "severity": annotation.severity,
        "owner": annotation.owner,
        "status": annotation.status,
        "note": annotation.note,
    }

    if payload.labels is not None:
        annotation.labels = payload.labels
    if payload.severity is not None:
        annotation.severity = payload.severity
    if payload.owner is not None:
        annotation.owner = payload.owner
    if payload.status is not None:
        annotation.status = payload.status
    if payload.note is not None:
        annotation.note = payload.note

    annotation.updated_at = _now_ms()

    after = {
        "labels": annotation.labels,
        "severity": annotation.severity,
        "owner": annotation.owner,
        "status": annotation.status,
        "note": annotation.note,
    }

    await log_update(
        session=session,
        entity_type="session_annotation",
        entity_id=annotation.id,
        old_values=before,
        new_values=after,
        project_id=annotation.project_id,
    )

    await session.commit()
    await session.refresh(annotation)
    return annotation
