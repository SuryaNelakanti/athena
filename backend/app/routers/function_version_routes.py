from typing import Any, Dict, List
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from ..database import get_session
from ..models import FunctionModel, FunctionVersionModel
from ..schemas.functions import CreateFunctionVersionRequest, InvokeFunctionRequest

router = APIRouter()


@router.get("/{function_id}/versions", response_model=List[FunctionVersionModel])
async def list_function_versions(
    function_id: str,
    session: AsyncSession = Depends(get_session),
):
    func = await session.get(FunctionModel, function_id)
    if not func:
        raise HTTPException(status_code=404, detail="Function not found")
    result = await session.execute(
        select(FunctionVersionModel)
        .where(FunctionVersionModel.function_id == function_id)
        .order_by(FunctionVersionModel.version.desc())
    )
    return result.scalars().all()


@router.post("/{function_id}/versions", response_model=FunctionVersionModel)
async def create_function_version(
    function_id: str,
    request: CreateFunctionVersionRequest,
    session: AsyncSession = Depends(get_session),
):
    func = await session.get(FunctionModel, function_id)
    if not func:
        raise HTTPException(status_code=404, detail="Function not found")
    result = await session.execute(
        select(FunctionVersionModel.version)
        .where(FunctionVersionModel.function_id == function_id)
        .order_by(FunctionVersionModel.version.desc())
    )
    latest = result.scalars().first()
    version = FunctionVersionModel(
        id=f"fnv_{uuid.uuid4().hex[:12]}",
        function_id=function_id,
        version=int(latest or 0) + 1,
        runtime=request.runtime or func.runtime,
        config=request.config or func.config or {},
        code=request.code if request.code is not None else func.code,
    )
    session.add(version)
    await session.commit()
    await session.refresh(version)
    return version


@router.post("/{function_id}/invoke")
async def invoke_function(
    function_id: str,
    request: InvokeFunctionRequest,
    session: AsyncSession = Depends(get_session),
):
    func = await session.get(FunctionModel, function_id)
    if not func or not func.enabled:
        raise HTTPException(status_code=404, detail="Function not found")
    version = None
    if request.version_id:
        version = await session.get(FunctionVersionModel, request.version_id)
        if not version or version.function_id != function_id:
            raise HTTPException(status_code=404, detail="Function version not found")
    runtime = version.runtime if version else func.runtime
    config = version.config if version else func.config
    if runtime == "builtin":
        output = {
            "input": request.input,
            "config": config,
            "result": request.input,
        }
    elif runtime == "llm_judge":
        output = {
            "score": None,
            "reasoning": "LLM judge invocation is registered; run through experiment/session eval execution.",
            "config": config,
        }
    else:
        output = {
            "status": "registered",
            "message": "Custom execution is metadata-only until the isolated worker is enabled.",
            "input": request.input,
        }
    return {
        "function_id": function_id,
        "version_id": version.id if version else None,
        "runtime": runtime,
        "output": output,
    }
