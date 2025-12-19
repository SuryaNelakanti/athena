"""
Functions Router - CRUD for scorer and tool functions.
"""

from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select
from pydantic import BaseModel
import uuid

from ..database import get_session
from ..models import FunctionModel
from ..services.scorer_service import BUILTIN_SCORERS

router = APIRouter(prefix="/functions", tags=["functions"])


class CreateFunctionRequest(BaseModel):
    name: str
    display_name: Optional[str] = None
    description: Optional[str] = None
    type: str = "scorer"  # scorer | tool
    runtime: str = "builtin"  # builtin | python | llm_judge
    config: dict = {}
    code: Optional[str] = None
    enabled: bool = True


class UpdateFunctionRequest(BaseModel):
    display_name: Optional[str] = None
    description: Optional[str] = None
    config: Optional[dict] = None
    code: Optional[str] = None
    enabled: Optional[bool] = None


@router.get("/", response_model=List[FunctionModel])
async def list_functions(
    project_id: Optional[str] = None,
    type: Optional[str] = None,
    include_builtin: bool = True,
    session: AsyncSession = Depends(get_session)
):
    """
    List functions. Optionally filter by project and/or type.
    Built-in functions (project_id=None) are always included unless include_builtin=False.
    """
    statement = select(FunctionModel)
    
    # Filter by type if specified
    if type:
        statement = statement.where(FunctionModel.type == type)
    
    # Filter by project (include builtins unless disabled)
    if project_id:
        if include_builtin:
            statement = statement.where(
                (FunctionModel.project_id == project_id) | (FunctionModel.project_id == None)
            )
        else:
            statement = statement.where(FunctionModel.project_id == project_id)
    elif not include_builtin:
        statement = statement.where(FunctionModel.project_id != None)
    
    statement = statement.order_by(FunctionModel.name)
    result = await session.execute(statement)
    return result.scalars().all()


@router.get("/scorers", response_model=List[FunctionModel])
async def list_scorers(
    project_id: Optional[str] = None,
    session: AsyncSession = Depends(get_session)
):
    """List all available scorers for a project (including built-ins)."""
    return await list_functions(project_id=project_id, type="scorer", session=session)


@router.get("/{function_id}", response_model=FunctionModel)
async def get_function(
    function_id: str,
    session: AsyncSession = Depends(get_session)
):
    """Get a specific function by ID."""
    func = await session.get(FunctionModel, function_id)
    if not func:
        raise HTTPException(status_code=404, detail="Function not found")
    return func


@router.post("/", response_model=FunctionModel)
async def create_function(
    request: CreateFunctionRequest,
    project_id: str,
    session: AsyncSession = Depends(get_session)
):
    """Create a new function (scorer or tool)."""
    # Check for unique name in project
    statement = select(FunctionModel).where(
        FunctionModel.project_id == project_id,
        FunctionModel.name == request.name
    )
    existing = await session.execute(statement)
    if existing.scalars().first():
        raise HTTPException(
            status_code=400,
            detail=f"Function with name '{request.name}' already exists in this project"
        )

    func = FunctionModel(
        id=f"fn_{uuid.uuid4().hex[:8]}",
        project_id=project_id,
        name=request.name,
        display_name=request.display_name,
        description=request.description,
        type=request.type,
        runtime=request.runtime,
        config=request.config,
        code=request.code,
        enabled=request.enabled,
    )
    
    session.add(func)
    await session.commit()
    await session.refresh(func)
    return func


@router.patch("/{function_id}", response_model=FunctionModel)
async def update_function(
    function_id: str,
    request: UpdateFunctionRequest,
    session: AsyncSession = Depends(get_session)
):
    """Update an existing function."""
    func = await session.get(FunctionModel, function_id)
    if not func:
        raise HTTPException(status_code=404, detail="Function not found")
    
    # Don't allow modifying built-in functions
    if func.project_id is None:
        raise HTTPException(status_code=400, detail="Cannot modify built-in functions")
    
    if request.display_name is not None:
        func.display_name = request.display_name
    if request.description is not None:
        func.description = request.description
    if request.config is not None:
        func.config = request.config
    if request.code is not None:
        func.code = request.code
    if request.enabled is not None:
        func.enabled = request.enabled
    
    session.add(func)
    await session.commit()
    await session.refresh(func)
    return func


@router.delete("/{function_id}")
async def delete_function(
    function_id: str,
    session: AsyncSession = Depends(get_session)
):
    """Delete a function."""
    func = await session.get(FunctionModel, function_id)
    if not func:
        raise HTTPException(status_code=404, detail="Function not found")
    
    # Don't allow deleting built-in functions
    if func.project_id is None:
        raise HTTPException(status_code=400, detail="Cannot delete built-in functions")
    
    await session.delete(func)
    await session.commit()
    return {"status": "deleted", "id": function_id}


@router.post("/seed-builtins")
async def seed_builtin_functions(
    session: AsyncSession = Depends(get_session)
):
    """
    Seed the database with built-in scorer functions.
    This is idempotent - won't create duplicates.
    """
    created = []
    skipped = []
    
    for scorer in BUILTIN_SCORERS:
        # Check if already exists
        statement = select(FunctionModel).where(
            FunctionModel.project_id == None,
            FunctionModel.name == scorer["name"]
        )
        result = await session.execute(statement)
        existing = result.scalars().first()
        
        if existing:
            skipped.append(scorer["name"])
            continue
        
        func = FunctionModel(
            id=f"fn_builtin_{scorer['name']}",
            project_id=None,  # Global/builtin
            name=scorer["name"],
            display_name=scorer["display_name"],
            description=scorer["description"],
            type="scorer",
            runtime=scorer["runtime"],
            config=scorer["config"],
            enabled=True,
        )
        session.add(func)
        created.append(scorer["name"])
    
    await session.commit()
    return {"created": created, "skipped": skipped}
