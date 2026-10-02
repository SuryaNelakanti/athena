"""Shared result contract for built-in scorer implementations."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional


@dataclass
class ScorerResult:
    """Result from a single scorer execution."""

    scorer_name: str
    score: Optional[float]
    details: Optional[Dict[str, Any]] = None

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {"score": self.score}
        if self.details:
            result["details"] = self.details
        return result
