from typing import Any, Optional

from pydantic import BaseModel, Field


class SpanFeedbackRequest(BaseModel):
    feedback_type: str = "rating"
    value: Any = None
    comment: Optional[str] = None
    labels: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class SpanScoreRequest(BaseModel):
    name: str
    score: Optional[float] = None
    passed: Optional[bool] = None
    reasoning: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)
