"""
Scorer Service - Implements various scoring functions for experiment evaluation.

Built-in scorers:
- exact_match: Normalized string equality
- contains: Check if expected is contained in output
- regex_match: Match output against regex pattern
- llm_judge: Use an LLM to evaluate quality (1-5 scale)
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from app.schemas.proxy import ChatCompletionRequest, ChatMessage
from app.services.proxy_service import ProxyService


@dataclass
class ScorerResult:
    """Result from a single scorer execution."""
    scorer_name: str
    score: Optional[float]
    details: Dict[str, Any] = None

    def to_dict(self) -> Dict[str, Any]:
        result = {"score": self.score}
        if self.details:
            result["details"] = self.details
        return result


class ScorerService:
    """Service for executing scorers on experiment outputs."""

    def __init__(self, session: Optional[AsyncSession] = None, project_id: Optional[str] = None):
        self.session = session
        self.project_id = project_id

    def _normalize_text(self, value: str) -> str:
        """Normalize text for comparison: strip, lowercase, collapse whitespace."""
        return " ".join(value.strip().lower().split())

    def extract_expected_text(self, expected: Any) -> Optional[str]:
        """Extract expected text from various input formats."""
        if expected is None or expected == {}:
            return None
        if isinstance(expected, str):
            return expected
        if isinstance(expected, dict):
            for key in ("content", "answer", "text", "expected"):
                value = expected.get(key)
                if isinstance(value, str):
                    return value
            # Try OpenAI response format
            try:
                choices = expected.get("choices")
                if isinstance(choices, list) and choices:
                    message = choices[0].get("message", {})
                    content = message.get("content")
                    if isinstance(content, str):
                        return content
            except Exception:
                pass
        return None

    # -------------------------------------------------------------------------
    # Built-in Scorers
    # -------------------------------------------------------------------------

    def score_exact_match(
        self,
        expected_text: Optional[str],
        actual_text: str,
        config: Optional[Dict] = None
    ) -> ScorerResult:
        """
        Exact match scorer: 1.0 if normalized strings match, 0.0 otherwise.
        
        Config options:
          - case_sensitive: bool (default: False)
          - normalize_whitespace: bool (default: True)
        """
        if expected_text is None:
            return ScorerResult(scorer_name="exact_match", score=None)

        cfg = config or {}
        case_sensitive = cfg.get("case_sensitive", False)
        normalize_ws = cfg.get("normalize_whitespace", True)

        expected = expected_text
        actual = actual_text

        if normalize_ws:
            expected = " ".join(expected.strip().split())
            actual = " ".join(actual.strip().split())

        if not case_sensitive:
            expected = expected.lower()
            actual = actual.lower()

        score = 1.0 if expected == actual else 0.0
        return ScorerResult(scorer_name="exact_match", score=score)

    def score_contains(
        self,
        expected_text: Optional[str],
        actual_text: str,
        config: Optional[Dict] = None
    ) -> ScorerResult:
        """
        Contains scorer: 1.0 if expected is found in output, 0.0 otherwise.
        
        Config options:
          - case_sensitive: bool (default: False)
        """
        if expected_text is None:
            return ScorerResult(scorer_name="contains", score=None)

        cfg = config or {}
        case_sensitive = cfg.get("case_sensitive", False)

        expected = expected_text
        actual = actual_text

        if not case_sensitive:
            expected = expected.lower()
            actual = actual.lower()

        score = 1.0 if expected in actual else 0.0
        return ScorerResult(scorer_name="contains", score=score)

    def score_regex_match(
        self,
        pattern: Optional[str],
        actual_text: str,
        config: Optional[Dict] = None
    ) -> ScorerResult:
        """
        Regex match scorer: 1.0 if pattern matches output, 0.0 otherwise.
        
        Config options:
          - flags: str (default: "") - regex flags like "i" for case insensitive
        """
        if pattern is None:
            return ScorerResult(scorer_name="regex_match", score=None)

        cfg = config or {}
        flags_str = cfg.get("flags", "")
        
        flags = 0
        if "i" in flags_str:
            flags |= re.IGNORECASE
        if "m" in flags_str:
            flags |= re.MULTILINE
        if "s" in flags_str:
            flags |= re.DOTALL

        try:
            match = re.search(pattern, actual_text, flags)
            score = 1.0 if match else 0.0
            return ScorerResult(
                scorer_name="regex_match",
                score=score,
                details={"matched": bool(match), "pattern": pattern}
            )
        except re.error as e:
            return ScorerResult(
                scorer_name="regex_match",
                score=None,
                details={"error": f"Invalid regex: {e}"}
            )

    async def score_llm_judge(
        self,
        expected_text: Optional[str],
        actual_text: str,
        input_text: str,
        config: Optional[Dict] = None
    ) -> ScorerResult:
        """
        LLM Judge scorer: Uses an LLM to evaluate the quality of the output.
        
        Returns a score from 0.0 to 1.0 (normalized from 1-5 scale).
        
        Config options:
          - model: str (default: "gpt-4o-mini")
          - provider: str (default: "openai")
          - criteria: str (default: "accuracy and relevance")
        """
        if not self.session:
            return ScorerResult(
                scorer_name="llm_judge",
                score=None,
                details={"error": "No session available for LLM judge"}
            )

        cfg = config or {}
        model = cfg.get("model", "gpt-4o-mini")
        provider = cfg.get("provider", "openai")
        criteria = cfg.get("criteria", "accuracy, relevance, and helpfulness")

        # Build the judge prompt
        judge_prompt = f"""You are an expert evaluator. Score the following AI response on a scale of 1-5 based on {criteria}.

INPUT/QUESTION:
{input_text}

"""
        if expected_text:
            judge_prompt += f"""EXPECTED/REFERENCE ANSWER:
{expected_text}

"""
        judge_prompt += f"""ACTUAL AI RESPONSE:
{actual_text}

Rate the response on a scale of 1-5 where:
1 = Very poor, completely wrong or irrelevant
2 = Poor, mostly incorrect or unhelpful
3 = Acceptable, partially correct or helpful
4 = Good, mostly correct and helpful
5 = Excellent, completely correct and very helpful

Respond with ONLY a single number (1, 2, 3, 4, or 5) and nothing else."""

        try:
            proxy_service = ProxyService(self.session)
            request = ChatCompletionRequest(
                model=model,
                provider=provider,
                messages=[ChatMessage(role="user", content=judge_prompt)],
                temperature=0.0,
                max_tokens=10,
                stream=False,
            )
            
            response = await proxy_service.chat_completion(request, project_id=self.project_id)
            
            if response.choices and response.choices[0].message:
                content = response.choices[0].message.content or ""
                # Extract the number from the response
                numbers = re.findall(r'[1-5]', content)
                if numbers:
                    raw_score = int(numbers[0])
                    normalized_score = (raw_score - 1) / 4.0  # Convert 1-5 to 0-1
                    return ScorerResult(
                        scorer_name="llm_judge",
                        score=normalized_score,
                        details={
                            "raw_score": raw_score,
                            "model": model,
                            "criteria": criteria
                        }
                    )

            return ScorerResult(
                scorer_name="llm_judge",
                score=None,
                details={"error": "Could not parse LLM response"}
            )

        except Exception as e:
            return ScorerResult(
                scorer_name="llm_judge",
                score=None,
                details={"error": str(e)}
            )

    async def score_anti_pattern(
        self,
        actual_text: str,
        config: Optional[Dict] = None
    ) -> ScorerResult:
        """
        Anti-pattern scorer: Checks if output resembles known bad patterns.
        
        Returns 1.0 if output does NOT match any anti-patterns (good).
        Returns < 1.0 based on similarity to anti-patterns (lower = more similar to bad patterns).
        
        Config options:
          - threshold: float (default: 0.7) - similarity threshold for matching
          - use_llm: bool (default: False) - use LLM for semantic comparison
        """
        if not self.session or not self.project_id:
            return ScorerResult(
                scorer_name="anti_pattern_check",
                score=1.0,  # No session = can't check, assume good
                details={"warning": "No session/project for anti-pattern check"}
            )

        from sqlmodel import select
        from app.models import DatasetModel, DatasetRowModel

        cfg = config or {}
        threshold = cfg.get("threshold", 0.7)
        use_llm = cfg.get("use_llm", False)
        
        try:
            # Get all datasets for this project
            dataset_stmt = select(DatasetModel).where(DatasetModel.project_id == self.project_id)
            dataset_result = await self.session.execute(dataset_stmt)
            datasets = dataset_result.scalars().all()
            
            if not datasets:
                return ScorerResult(
                    scorer_name="anti_pattern_check",
                    score=1.0,
                    details={"message": "No datasets to check against"}
                )
            
            # Get all anti-pattern rows from these datasets
            dataset_ids = [d.id for d in datasets]
            row_stmt = select(DatasetRowModel).where(
                DatasetRowModel.dataset_id.in_(dataset_ids),
                DatasetRowModel.example_type == "anti_pattern"
            )
            row_result = await self.session.execute(row_stmt)
            anti_patterns = row_result.scalars().all()
            
            if not anti_patterns:
                return ScorerResult(
                    scorer_name="anti_pattern_check",
                    score=1.0,
                    details={"message": "No anti-patterns defined, output is OK"}
                )
            
            # Check against each anti-pattern
            actual_normalized = self._normalize_text(actual_text)
            matches = []
            
            for pattern in anti_patterns:
                pattern_text = self.extract_expected_text(pattern.expected) or ""
                pattern_normalized = self._normalize_text(pattern_text)
                
                if not pattern_normalized:
                    continue
                
                # Simple substring check first
                if pattern_normalized in actual_normalized or actual_normalized in pattern_normalized:
                    matches.append({
                        "pattern_id": pattern.id,
                        "similarity": 0.9,
                        "method": "substring"
                    })
                    continue
                
                # Word overlap similarity
                actual_words = set(actual_normalized.split())
                pattern_words = set(pattern_normalized.split())
                
                if actual_words and pattern_words:
                    overlap = len(actual_words & pattern_words) / max(len(actual_words), len(pattern_words))
                    if overlap >= threshold:
                        matches.append({
                            "pattern_id": pattern.id,
                            "similarity": overlap,
                            "method": "word_overlap"
                        })
            
            # Calculate score: 1.0 if no matches, lower if matches found
            if not matches:
                return ScorerResult(
                    scorer_name="anti_pattern_check",
                    score=1.0,
                    details={"message": "No anti-pattern matches found"}
                )
            
            # Return lowest score (highest concern)
            worst_match = max(matches, key=lambda x: x["similarity"])
            score = 1.0 - worst_match["similarity"]
            
            return ScorerResult(
                scorer_name="anti_pattern_check",
                score=score,
                details={
                    "matches": matches,
                    "worst_match": worst_match,
                    "message": f"Output resembles anti-pattern (similarity: {worst_match['similarity']:.2f})"
                }
            )
            
        except Exception as e:
            return ScorerResult(
                scorer_name="anti_pattern_check",
                score=None,
                details={"error": str(e)}
            )

    # -------------------------------------------------------------------------
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
            
            if result.score is not None:
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

