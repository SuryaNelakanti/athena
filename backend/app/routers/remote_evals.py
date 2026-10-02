from __future__ import annotations

from typing import Any, Dict, List, Optional
import time
import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.database import get_session
from app.models import RemoteEvalModel

router = APIRouter(prefix="/remote-evals", tags=["remote-evals"])


class RemoteEvalRegisterRequest(BaseModel):
    project_id: str
    name: str
    endpoint_url: str
    auth: Dict[str, Any] = Field(default_factory=dict)
    config: Dict[str, Any] = Field(default_factory=dict)


class RemoteEvalInvokeRequest(BaseModel):
    input: Any = None
    expected: Any = None
    context: Dict[str, Any] = Field(default_factory=dict)
    dry_run: bool = False


@router.get("", response_model=List[RemoteEvalModel])
async def list_remote_evals(
    project_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(RemoteEvalModel)
        .where(RemoteEvalModel.project_id == project_id)
        .order_by(RemoteEvalModel.created_at.desc())
    )
    return result.scalars().all()


@router.post("/register", response_model=RemoteEvalModel)
async def register_remote_eval(
    payload: RemoteEvalRegisterRequest,
    session: AsyncSession = Depends(get_session),
):
    now = int(time.time() * 1000)
    remote_eval = RemoteEvalModel(
        id=f"reval_{uuid.uuid4().hex[:16]}",
        project_id=payload.project_id,
        name=payload.name,
        endpoint_url=payload.endpoint_url,
        auth=payload.auth,
        config=payload.config,
        created_at=now,
        updated_at=now,
    )
    session.add(remote_eval)
    await session.commit()
    await session.refresh(remote_eval)
    return remote_eval


@router.post("/{remote_eval_id}/invoke")
async def invoke_remote_eval(
    remote_eval_id: str,
    payload: RemoteEvalInvokeRequest,
    session: AsyncSession = Depends(get_session),
):
    remote_eval = await session.get(RemoteEvalModel, remote_eval_id)
    if not remote_eval:
        raise HTTPException(status_code=404, detail="Remote eval not found")
    body = {
        "input": payload.input,
        "expected": payload.expected,
        "context": payload.context,
        "config": remote_eval.config or {},
    }
    if payload.dry_run:
        return {"status": "dry_run", "remote_eval_id": remote_eval_id, "request": body}
    headers = {}
    bearer = (remote_eval.auth or {}).get("bearer_token")
    if bearer:
        headers["Authorization"] = f"Bearer {bearer}"
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(remote_eval.endpoint_url, json=body, headers=headers)
            response.raise_for_status()
            try:
                result = response.json()
            except ValueError:
                result = {"text": response.text}
            return {"status": "completed", "remote_eval_id": remote_eval_id, "result": result}
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Remote eval failed: {exc}") from exc
