from typing import Any, List, Optional

from pydantic import BaseModel


class ReviewItemCreate(BaseModel):
    project_id: str
    org_id: Optional[str] = None
    source_type: str
    source_id: str
    priority: Optional[int] = 0
    labels: Optional[List[str]] = None
    score: Optional[float] = None
    notes: Optional[str] = None
    meta: Optional[dict[str, Any]] = None


class ReviewItemUpdate(BaseModel):
    status: Optional[str] = None
    priority: Optional[int] = None
    labels: Optional[List[str]] = None
    score: Optional[float] = None
    notes: Optional[str] = None
    meta: Optional[dict[str, Any]] = None


class ReviewFromTraceRequest(BaseModel):
    trace_id: str
    project_id: Optional[str] = None
    priority: Optional[int] = 0
    labels: Optional[List[str]] = None
    notes: Optional[str] = None


class ReviewPromoteRequest(BaseModel):
    dataset_id: str
    corrected_expected: Optional[dict] = None
    example_type: Optional[str] = "gold"
    row_kind: Optional[str] = None
    eval_label: Optional[str] = None
