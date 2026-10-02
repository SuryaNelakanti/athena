"""
Scorer Service - Implements various scoring functions for experiment evaluation.

Built-in scorers:
- exact_match: Normalized string equality
- contains: Check if expected is contained in output
- regex_match: Match output against regex pattern
- llm_judge: Use an LLM to evaluate quality (1-5 scale)
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from app.services.anti_pattern_scorer import AntiPatternScorer
from app.services.deterministic_scorers import (
    score_contains as score_contains_text,
    score_exact_match as score_exact_match_text,
    score_regex_match as score_regex_match_text,
)
from app.services.llm_judge_scorer import LLMJudgeScorer
from app.services.scorer_result import ScorerResult
from app.services.structured_data import extract_expected_text as extract_expected_text_value


class ScorerService:
    """Service for executing scorers on experiment outputs."""

    def __init__(self, session: Optional[AsyncSession] = None, project_id: Optional[str] = None):
        self.session = session
        self.project_id = project_id

    def extract_expected_text(self, expected: object) -> Optional[str]:
        """Extract expected text from plain, structured, or chat-response data."""
        return extract_expected_text_value(expected)

    # -------------------------------------------------------------------------
    # Built-in Scorers
    # -------------------------------------------------------------------------

    def score_exact_match(
        self,
        expected_text: Optional[str],
        actual_text: str,
        config: Optional[Dict] = None,
    ) -> ScorerResult:
        return score_exact_match_text(expected_text, actual_text, config)

    def score_contains(
        self,
        expected_text: Optional[str],
        actual_text: str,
        config: Optional[Dict] = None,
    ) -> ScorerResult:
        return score_contains_text(expected_text, actual_text, config)

    def score_regex_match(
        self,
        pattern: Optional[str],
        actual_text: str,
        config: Optional[Dict] = None,
    ) -> ScorerResult:
        return score_regex_match_text(pattern, actual_text, config)
    async def score_llm_judge(
        self,
        expected_text: Optional[str],
        actual_text: str,
        input_text: str,
        config: Optional[Dict] = None,
    ) -> ScorerResult:
        """Delegate semantic evaluation to the focused LLM judge scorer."""
        scorer = LLMJudgeScorer(self.session, self.project_id)
        return await scorer.score(expected_text, actual_text, input_text, config)

    async def score_anti_pattern(
        self,
        actual_text: str,
        config: Optional[Dict] = None
    ) -> ScorerResult:
        """Score output against the project's labeled anti-pattern examples."""
        scorer = AntiPatternScorer(self.session, self.project_id)
        return await scorer.score(actual_text, config)

    # Scorer Dispatcher
    # -------------------------------------------------------------------------

    async def run_scorer(
        self,
        scorer_type: str,
        expected: Any,
        actual_text: str,
        input_text: str = "",
        config: Optional[Dict] = None
    ) -> ScorerResult:
        """
        Run a single scorer by type.
        
        Args:
            scorer_type: One of "exact_match", "contains", "regex_match", "llm_judge"
            expected: The expected value (format depends on scorer)
            actual_text: The actual output text to score
            input_text: The original input (used by llm_judge)
            config: Scorer-specific configuration
        """
        expected_text = self.extract_expected_text(expected)

        if scorer_type == "exact_match":
            return self.score_exact_match(expected_text, actual_text, config)
        elif scorer_type == "contains":
            return self.score_contains(expected_text, actual_text, config)
        elif scorer_type == "regex_match":
            # For regex, expected should be the pattern
            pattern = expected_text or (config or {}).get("pattern")
            return self.score_regex_match(pattern, actual_text, config)
        elif scorer_type == "llm_judge":
            return await self.score_llm_judge(expected_text, actual_text, input_text, config)
        elif scorer_type == "anti_pattern_check":
            return await self.score_anti_pattern(actual_text, config)
        else:
            return ScorerResult(
                scorer_name=scorer_type,
                score=None,
                details={"error": f"Unknown scorer type: {scorer_type}"}
            )

    async def run_scorers(
        self,
        scorers: List[Dict[str, Any]],
        expected: Any,
        actual_text: str,
        input_text: str = ""
    ) -> Dict[str, Any]:
        """
        Run multiple scorers and return aggregated results.
        
        Args:
            scorers: List of scorer configs, each with {"type": "...", ...config}
            expected: The expected value
            actual_text: The actual output text
            input_text: The original input
            
        Returns:
            Dict mapping scorer_name to score value
        """
        results: Dict[str, Any] = {}
        
        for scorer_cfg in scorers:
            scorer_type = scorer_cfg.get("type", "exact_match")
            config = {k: v for k, v in scorer_cfg.items() if k != "type"}
            
            result = await self.run_scorer(
                scorer_type=scorer_type,
                expected=expected,
                actual_text=actual_text,
                input_text=input_text,
                config=config
            )
            
            results[result.scorer_name] = result.score
            if result.details:
                results[f"{result.scorer_name}_details"] = result.details
        
        return results


# -------------------------------------------------------------------------
# Built-in Scorer Definitions (for seeding)
# -------------------------------------------------------------------------

BUILTIN_SCORERS = [
    {
        "name": "exact_match",
        "display_name": "Exact Match",
        "description": "Returns 1.0 if the normalized output exactly matches the expected value, 0.0 otherwise.",
        "runtime": "builtin",
        "config": {
            "case_sensitive": False,
            "normalize_whitespace": True
        }
    },
    {
        "name": "contains",
        "display_name": "Contains",
        "description": "Returns 1.0 if the expected value is found within the output, 0.0 otherwise.",
        "runtime": "builtin",
        "config": {
            "case_sensitive": False
        }
    },
    {
        "name": "regex_match",
        "display_name": "Regex Match",
        "description": "Returns 1.0 if the output matches the given regex pattern, 0.0 otherwise.",
        "runtime": "builtin",
        "config": {
            "flags": ""
        }
    },
    {
        "name": "llm_judge",
        "display_name": "LLM Judge",
        "description": "Uses an LLM to evaluate output quality on a 1-5 scale, normalized to 0-1.",
        "runtime": "llm_judge",
        "config": {
            "model": "gpt-4o-mini",
            "provider": "openai",
            "criteria": "accuracy, relevance, and helpfulness"
        }
    },
    {
        "name": "anti_pattern_check",
        "display_name": "Anti-Pattern Check",
        "description": "Checks if output resembles known bad patterns. Returns 1.0 if no matches (good), lower if similar to anti-patterns.",
        "runtime": "builtin",
        "config": {
            "threshold": 0.7
        }
    }
]

