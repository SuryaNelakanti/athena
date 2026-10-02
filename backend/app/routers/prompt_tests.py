from typing import List, Optional
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlmodel import Session, select
from ..database import get_session
from ..models import PromptTestModel, PromptTestResultModel, Project, DatasetModel
from ..services.prompt_test_service import PromptTestService

router = APIRouter(
    prefix="/prompt-tests",
    tags=["prompt-tests"],
    responses={404: {"description": "Not found"}},
)

@router.post("/", response_model=PromptTestModel)
async def create_prompt_test(
    prompt_test: PromptTestModel,
    session: Session = Depends(get_session)
):
    # Verify project and dataset exist
    project = session.get(Project, prompt_test.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    dataset = session.get(DatasetModel, prompt_test.dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    # Generate ID if not provided
    if not prompt_test.id:
        prompt_test.id = f"pt_{uuid.uuid4().hex[:12]}"

    session.add(prompt_test)
    session.commit()
    session.refresh(prompt_test)
    return prompt_test

@router.post("/{prompt_test_id}/run", response_model=PromptTestModel)
async def run_prompt_test(
    prompt_test_id: str,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session)
):
    prompt_test = session.get(PromptTestModel, prompt_test_id)
    if not prompt_test:
        raise HTTPException(status_code=404, detail="Prompt Test not found")

    # Check if already running?
    # For now allow re-run (which might parallelize if careful, but status updates clash)
    # Ideally should block if running.
    if prompt_test.status == "running":
        raise HTTPException(status_code=400, detail="Prompt test is already running")

    # Set status to pending run
    prompt_test.status = "pending"
    prompt_test.summary = {} # Reset summary?
    session.add(prompt_test)
    session.commit()
    session.refresh(prompt_test)

    # Queue background task
    background_tasks.add_task(PromptTestService.execute_prompt_test, prompt_test.id)
    return prompt_test

@router.get("/{prompt_test_id}", response_model=PromptTestModel)
async def get_prompt_test(
    prompt_test_id: str,
    session: Session = Depends(get_session)
):
    prompt_test = session.get(PromptTestModel, prompt_test_id)
    if not prompt_test:
        raise HTTPException(status_code=404, detail="Prompt Test not found")
    return prompt_test

@router.get("/", response_model=List[PromptTestModel])
async def list_prompt_tests(
    project_id: str,
    dataset_id: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    session: Session = Depends(get_session)
):
    query = select(PromptTestModel).where(PromptTestModel.project_id == project_id)
    if dataset_id:
        query = query.where(PromptTestModel.dataset_id == dataset_id)

    query = query.order_by(PromptTestModel.created_at.desc()).offset(offset).limit(limit)
    results = session.exec(query).all()
    return results

@router.get("/{prompt_test_id}/results", response_model=List[PromptTestResultModel])
async def get_prompt_test_results(
    prompt_test_id: str,
    limit: int = 100,
    offset: int = 0,
    session: Session = Depends(get_session)
):
    # Verify prompt test exists
    prompt_test = session.get(PromptTestModel, prompt_test_id)
    if not prompt_test:
        raise HTTPException(status_code=404, detail="Prompt Test not found")

    query = select(PromptTestResultModel).where(
        PromptTestResultModel.prompt_test_id == prompt_test_id
    ).offset(offset).limit(limit)

    results = session.exec(query).all()
    return results
