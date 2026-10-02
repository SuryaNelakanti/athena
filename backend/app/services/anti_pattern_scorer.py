"""Database-backed scorer that checks output against labeled anti-pattern rows."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Optional

from sqlalchemy import or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.models import DatasetModel, DatasetRowModel
from app.services.anti_pattern_matching import match_normalized_text, normalize_text
from app.services.scorer_result import ScorerResult
from app.services.structured_data import extract_expected_text


@dataclass(frozen=True)
class AntiPatternMatch:
    pattern_id: str
    similarity: float
    method: str

    def as_dict(self) -> dict[str, object]:
        return {
            "pattern_id": self.pattern_id,
            "similarity": self.similarity,
            "method": self.method,
        }


class AntiPatternScorer:
    """Find lexical matches against a project's labeled anti-pattern examples."""

    def __init__(self, session: Optional[AsyncSession], project_id: Optional[str]):
        self.session = session
        self.project_id = project_id

    @staticmethod
    def _normalize_text(value: str) -> str:
        return normalize_text(value)

    async def score(self, actual_text: str, config: Optional[Dict] = None) -> ScorerResult:
        if not self.session or not self.project_id:
            return ScorerResult(
                scorer_name="anti_pattern_check",
                score=1.0,
                details={"warning": "No session/project for anti-pattern check"},
            )

        cfg = config or {}
        threshold = cfg.get("threshold", 0.7)
        try:
            anti_patterns = await self._load_anti_patterns()
            if anti_patterns is None:
                return ScorerResult(
                    scorer_name="anti_pattern_check",
                    score=1.0,
                    details={"message": "No datasets to check against"},
                )
            if not anti_patterns:
                return ScorerResult(
                    scorer_name="anti_pattern_check",
                    score=1.0,
                    details={"message": "No anti-patterns defined, output is OK"},
                )

            matches = self._find_matches(actual_text, anti_patterns, threshold)
            return self._result_for_matches(matches)
        except Exception as error:
            return ScorerResult(
                scorer_name="anti_pattern_check",
                score=None,
                details={"error": str(error)},
            )

    async def _load_anti_patterns(self) -> Optional[list[DatasetRowModel]]:
        dataset_result = await self.session.execute(
            select(DatasetModel).where(DatasetModel.project_id == self.project_id)
        )
        datasets = dataset_result.scalars().all()
        if not datasets:
            return None

        dataset_ids = [dataset.id for dataset in datasets]
        row_statement = select(DatasetRowModel).where(
            DatasetRowModel.dataset_id.in_(dataset_ids),
            or_(
                DatasetRowModel.eval_label == "anti_pattern",
                DatasetRowModel.example_type == "anti_pattern",
            ),
            or_(
                DatasetRowModel.row_kind == "eval",
                DatasetRowModel.row_kind.is_(None),
            ),
        )
        row_result = await self.session.execute(row_statement)
        return list(row_result.scalars().all())

    def _find_matches(
        self,
        actual_text: str,
        anti_patterns: list[DatasetRowModel],
        threshold: float,
    ) -> list[AntiPatternMatch]:
        actual_normalized = self._normalize_text(actual_text)
        matches: list[AntiPatternMatch] = []
        for pattern in anti_patterns:
            pattern_text = extract_expected_text(pattern.expected) or ""
            pattern_normalized = self._normalize_text(pattern_text)
            match = match_normalized_text(actual_normalized, pattern_normalized, threshold)
            if match:
                matches.append(
                    AntiPatternMatch(pattern.id, match.similarity, match.method)
                )
        return matches

    def _result_for_matches(self, matches: list[AntiPatternMatch]) -> ScorerResult:
        if not matches:
            return ScorerResult(
                scorer_name="anti_pattern_check",
                score=1.0,
                details={"message": "No anti-pattern matches found"},
            )

        worst_match = max(matches, key=lambda match: match.similarity)
        similarity = worst_match.similarity
        return ScorerResult(
            scorer_name="anti_pattern_check",
            score=1.0 - similarity,
            details={
                "matches": [match.as_dict() for match in matches],
                "worst_match": worst_match.as_dict(),
                "message": f"Output resembles anti-pattern (similarity: {similarity:.2f})",
            },
        )
