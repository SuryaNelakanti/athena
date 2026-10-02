from __future__ import annotations

import time
import uuid
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from ..database import get_session
from ..models import (
    DatasetModel,
    DatasetRowModel,
    ExperimentModel,
    ExperimentRunModel,
    ExperimentVersionModel,
    FunctionModel,
    LogModel,
    McpTokenModel,
    Project,
    ShareLinkModel,
    TraceModel,
    ViewModel,
)
from ..schemas.mcp_tools import (
    GeneratePermalinkRequest,
    ListRecentObjectsRequest,
    ResolveObjectRequest,
)
from .mcp_oauth import _require_mcp_token

router = APIRouter()


async def _create_share_link(
    session: AsyncSession,
    object_type: str,
    object_id: str,
    project_id: Optional[str],
    org_id: Optional[str],
    expires_in: Optional[int],
) -> ShareLinkModel:
    now = int(time.time() * 1000)
    expires_at = now + (expires_in * 1000) if expires_in else None
    token = uuid.uuid4().hex[:12]
    link = ShareLinkModel(
        id=f"sh_{uuid.uuid4().hex[:10]}",
        token=token,
        org_id=org_id,
        project_id=project_id,
        object_type=object_type,
        object_id=object_id,
        expires_at=expires_at,
        created_at=now,
    )
    session.add(link)
    await session.commit()
    await session.refresh(link)
    return link


@router.post("/tools/resolve_object")
async def resolve_object(
    payload: ResolveObjectRequest,
    session: AsyncSession = Depends(get_session),
    _: McpTokenModel = Depends(_require_mcp_token),
) -> dict[str, Any]:
    obj_type = payload.object_type
    name_or_id = payload.name_or_id
    project_id = payload.project_id

    resolver_map: dict[str, tuple[Any, Optional[str]]] = {
        "project": (Project, "name"),
        "dataset": (DatasetModel, "name"),
        "experiment": (ExperimentModel, "name"),
        "function": (FunctionModel, "name"),
        "view": (ViewModel, "name"),
        "log": (LogModel, None),
        "trace": (TraceModel, None),
        "experiment_run": (ExperimentRunModel, None),
        "experiment_version": (ExperimentVersionModel, None),
        "dataset_row": (DatasetRowModel, None),
    }
    if obj_type not in resolver_map:
        raise HTTPException(status_code=400, detail="Unsupported object_type")

    model, name_field = resolver_map[obj_type]
    obj = await session.get(model, name_or_id)
    if not obj and name_field:
        field = getattr(model, name_field)
        statement = select(model).where(field == name_or_id)
        if project_id and hasattr(model, "project_id"):
            statement = statement.where(model.project_id == project_id)
        result = await session.execute(statement)
        obj = result.scalar_one_or_none()

    if not obj:
        raise HTTPException(status_code=404, detail="Object not found")

    permalink = None
    if payload.include_permalink:
        link = await _create_share_link(
            session=session,
            object_type=obj_type,
            object_id=obj.id,
            project_id=getattr(obj, "project_id", project_id),
            org_id=getattr(obj, "org_id", None),
            expires_in=None,
        )
        permalink = f"/share-links/{link.token}"

    return {
        "object_type": obj_type,
        "id": obj.id,
        "name": getattr(obj, "name", None),
        "project_id": getattr(obj, "project_id", None),
        "permalink": permalink,
    }


@router.post("/tools/list_recent_objects")
async def list_recent_objects(
    payload: ListRecentObjectsRequest,
    session: AsyncSession = Depends(get_session),
    _: McpTokenModel = Depends(_require_mcp_token),
) -> dict[str, Any]:
    object_types = payload.object_types or ["project", "dataset", "experiment", "function"]
    limit = max(1, min(payload.limit or 10, 50))
    results: list[dict[str, Any]] = []

    async def add_results(obj_type: str, model: Any, name_field: Optional[str]) -> None:
        statement = select(model)
        if payload.project_id and hasattr(model, "project_id"):
            statement = statement.where(model.project_id == payload.project_id)
        if hasattr(model, "created_at"):
            statement = statement.order_by(model.created_at.desc())
        elif name_field:
            statement = statement.order_by(getattr(model, name_field))
        statement = statement.limit(limit)
        result = await session.execute(statement)
        for obj in result.scalars().all():
            results.append(
                {
                    "object_type": obj_type,
                    "id": obj.id,
                    "name": getattr(obj, "name", None),
                    "project_id": getattr(obj, "project_id", None),
                    "created_at": getattr(obj, "created_at", None),
                }
            )

    mapping: dict[str, tuple[Any, Optional[str]]] = {
        "project": (Project, "name"),
        "dataset": (DatasetModel, "name"),
        "experiment": (ExperimentModel, "name"),
        "function": (FunctionModel, "name"),
        "view": (ViewModel, "name"),
    }
    for obj_type in object_types:
        if obj_type not in mapping:
            continue
        model, name_field = mapping[obj_type]
        await add_results(obj_type, model, name_field)

    return {"count": len(results), "results": results}


@router.post("/tools/generate_permalink")
async def generate_permalink(
    payload: GeneratePermalinkRequest,
    session: AsyncSession = Depends(get_session),
    _: McpTokenModel = Depends(_require_mcp_token),
) -> dict[str, Any]:
    link = await _create_share_link(
        session=session,
        object_type=payload.object_type,
        object_id=payload.object_id,
        project_id=payload.project_id,
        org_id=payload.org_id,
        expires_in=payload.expires_in,
    )
    return {
        "token": link.token,
        "permalink": f"/share-links/{link.token}",
        "expires_at": link.expires_at,
    }
