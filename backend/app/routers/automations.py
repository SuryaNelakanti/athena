from __future__ import annotations

from typing import Any, Dict, List, Optional
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.database import get_session
from app.models import AgentRunModel, AutomationRuleModel, AutomationRunModel
from app.services.automation_service import AutomationService

router = APIRouter(prefix="/automations", tags=["automations"])


class AutomationRuleCreate(BaseModel):
    project_id: str
    name: str
    enabled: bool = True
    trigger: Dict[str, Any]
    actions: List[Dict[str, Any]]


class AutomationRuleUpdate(BaseModel):
    name: Optional[str] = None
    enabled: Optional[bool] = None
    trigger: Optional[Dict[str, Any]] = None
    actions: Optional[List[Dict[str, Any]]] = None


@router.get("/rules", response_model=List[AutomationRuleModel])
async def list_rules(
    project_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(AutomationRuleModel)
        .where(AutomationRuleModel.project_id == project_id)
        .order_by(AutomationRuleModel.created_at.desc())
    )
    return result.scalars().all()


@router.post("/rules", response_model=AutomationRuleModel)
async def create_rule(
    payload: AutomationRuleCreate,
    session: AsyncSession = Depends(get_session),
):
    now = int(time.time() * 1000)
    rule = AutomationRuleModel(
        id=f"rule_{uuid.uuid4().hex[:16]}",
        project_id=payload.project_id,
        name=payload.name,
        enabled=payload.enabled,
        trigger=payload.trigger,
        actions=payload.actions,
        created_at=now,
        updated_at=now,
    )
    session.add(rule)
    await session.commit()
    await session.refresh(rule)
    return rule


@router.patch("/rules/{rule_id}", response_model=AutomationRuleModel)
async def update_rule(
    rule_id: str,
    payload: AutomationRuleUpdate,
    session: AsyncSession = Depends(get_session),
):
    rule = await session.get(AutomationRuleModel, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Automation rule not found")
    if payload.name is not None:
        rule.name = payload.name
    if payload.enabled is not None:
        rule.enabled = payload.enabled
    if payload.trigger is not None:
        rule.trigger = payload.trigger
    if payload.actions is not None:
        rule.actions = payload.actions
    rule.updated_at = int(time.time() * 1000)
    session.add(rule)
    await session.commit()
    await session.refresh(rule)
    return rule


@router.get("/runs", response_model=List[AutomationRunModel])
async def list_runs(
    project_id: str = Query(...),
    rule_id: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
):
    stmt = select(AutomationRunModel).where(AutomationRunModel.project_id == project_id)
    if rule_id:
        stmt = stmt.where(AutomationRunModel.rule_id == rule_id)
    stmt = stmt.order_by(AutomationRunModel.created_at.desc()).limit(100)
    result = await session.execute(stmt)
    return result.scalars().all()


@router.post("/rules/{rule_id}/test", response_model=AutomationRunModel)
async def test_rule(
    rule_id: str,
    run_id: str,
    session: AsyncSession = Depends(get_session),
):
    rule = await session.get(AutomationRuleModel, rule_id)
    run = await session.get(AgentRunModel, run_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Automation rule not found")
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    service = AutomationService(session)
    created = await service.evaluate_run(run)
    if not created:
        raise HTTPException(status_code=400, detail="Rule did not match this run")
    await session.commit()
    await session.refresh(created[0])
    return created[0]
