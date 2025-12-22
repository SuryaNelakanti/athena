"""
Monitor Charts Router - Saved AQL charts for the dashboard.
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional, Dict, Any
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
import uuid
import time

from app.database import get_session
from app.models import MonitorChartModel


router = APIRouter(prefix="/charts", tags=["charts"])

ALLOWED_CHART_TYPES = {"line", "area", "bar"}


class MonitorChartCreate(BaseModel):
    project_id: str
    name: str
    query: str
    chart_type: Optional[str] = "line"
    x_field: str
    y_field: str
    series_field: Optional[str] = None
    config: Optional[Dict[str, Any]] = None


class MonitorChartUpdate(BaseModel):
    name: Optional[str] = None
    query: Optional[str] = None
    chart_type: Optional[str] = None
    x_field: Optional[str] = None
    y_field: Optional[str] = None
    series_field: Optional[str] = None
    config: Optional[Dict[str, Any]] = None


class MonitorChartResponse(BaseModel):
    id: str
    project_id: str
    name: str
    query: str
    chart_type: str
    x_field: str
    y_field: str
    series_field: Optional[str] = None
    config: Dict[str, Any] = {}
    created_at: int
    updated_at: int

    class Config:
        from_attributes = True


def _validate_chart_type(chart_type: Optional[str]) -> str:
    if not chart_type:
        return "line"
    normalized = chart_type.lower().strip()
    if normalized not in ALLOWED_CHART_TYPES:
        raise HTTPException(status_code=400, detail="Invalid chart_type. Must be line, area, or bar.")
    return normalized


@router.get("/{project_id}", response_model=List[MonitorChartResponse])
async def list_charts(project_id: str, session: AsyncSession = Depends(get_session)):
    stmt = select(MonitorChartModel).where(MonitorChartModel.project_id == project_id)
    stmt = stmt.order_by(MonitorChartModel.created_at.asc())
    result = await session.execute(stmt)
    return result.scalars().all()


@router.post("", response_model=MonitorChartResponse, status_code=201)
async def create_chart(payload: MonitorChartCreate, session: AsyncSession = Depends(get_session)):
    if not payload.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty.")
    chart_type = _validate_chart_type(payload.chart_type)
    now = int(time.time() * 1000)
    chart = MonitorChartModel(
        id=f"chart_{uuid.uuid4().hex[:16]}",
        project_id=payload.project_id,
        name=payload.name,
        query=payload.query,
        chart_type=chart_type,
        x_field=payload.x_field,
        y_field=payload.y_field,
        series_field=payload.series_field,
        config=payload.config or {},
        created_at=now,
        updated_at=now,
    )
    session.add(chart)
    await session.commit()
    await session.refresh(chart)
    return chart


@router.patch("/{chart_id}", response_model=MonitorChartResponse)
async def update_chart(
    chart_id: str,
    payload: MonitorChartUpdate,
    session: AsyncSession = Depends(get_session),
):
    chart = await session.get(MonitorChartModel, chart_id)
    if not chart:
        raise HTTPException(status_code=404, detail="Chart not found")

    if payload.name is not None:
        chart.name = payload.name
    if payload.query is not None:
        if not payload.query.strip():
            raise HTTPException(status_code=400, detail="Query cannot be empty.")
        chart.query = payload.query
    if payload.chart_type is not None:
        chart.chart_type = _validate_chart_type(payload.chart_type)
    if payload.x_field is not None:
        chart.x_field = payload.x_field
    if payload.y_field is not None:
        chart.y_field = payload.y_field
    if payload.series_field is not None:
        chart.series_field = payload.series_field
    if payload.config is not None:
        chart.config = payload.config

    chart.updated_at = int(time.time() * 1000)
    session.add(chart)
    await session.commit()
    await session.refresh(chart)
    return chart


@router.delete("/{chart_id}")
async def delete_chart(chart_id: str, session: AsyncSession = Depends(get_session)):
    chart = await session.get(MonitorChartModel, chart_id)
    if not chart:
        raise HTTPException(status_code=404, detail="Chart not found")
    await session.delete(chart)
    await session.commit()
    return {"status": "success", "message": f"Chart {chart_id} deleted"}
