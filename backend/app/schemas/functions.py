from typing import Any, Dict, Optional

from pydantic import BaseModel, Field


class CreateFunctionRequest(BaseModel):
    name: str
    display_name: Optional[str] = None
    description: Optional[str] = None
    type: str = "scorer"  # scorer | tool
    runtime: str = "builtin"  # builtin | python | llm_judge
    config: dict = Field(default_factory=dict)
    code: Optional[str] = None
    enabled: bool = True


class UpdateFunctionRequest(BaseModel):
    display_name: Optional[str] = None
    description: Optional[str] = None
    config: Optional[dict] = None
    code: Optional[str] = None
    enabled: Optional[bool] = None


class CreateFunctionVersionRequest(BaseModel):
    runtime: Optional[str] = None
    config: Dict[str, Any] = Field(default_factory=dict)
    code: Optional[str] = None


class InvokeFunctionRequest(BaseModel):
    input: Any = None
    context: Dict[str, Any] = Field(default_factory=dict)
    version_id: Optional[str] = None
