from typing import Any, List, Optional

from pydantic import BaseModel, Field


class DatasetCounts(BaseModel):
    total: int
    eval: int
    resource: int


class DatasetResponse(BaseModel):
    id: str
    project_id: str
    name: str
    description: Optional[str] = None
    version: int
    kind: str = "eval"
    schema: dict = Field(default_factory=dict)
    schema_version: int = 1
    review_policy: dict = Field(default_factory=dict)
    created_at: int
    row_counts: DatasetCounts

    class Config:
        from_attributes = True


class DatasetCreate(BaseModel):
    id: Optional[str] = None
    project_id: str
    name: str
    description: Optional[str] = None
    kind: Optional[str] = None
    schema: Optional[dict] = None
    schema_version: Optional[int] = None
    review_policy: Optional[dict] = None


class DatasetRowCreate(BaseModel):
    input: Any
    expected: Optional[Any] = None
    meta: Optional[dict] = None
    example_type: Optional[str] = None
    row_kind: Optional[str] = None
    eval_label: Optional[str] = None


class DatasetRowUpdate(BaseModel):
    input: Optional[Any] = None
    expected: Optional[Any] = None
    meta: Optional[dict] = None
    example_type: Optional[str] = None
    row_kind: Optional[str] = None
    eval_label: Optional[str] = None
    is_deleted: Optional[bool] = None
    reason: Optional[str] = None
