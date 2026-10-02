"""Deterministic built-in scorers for expected and produced text."""

from __future__ import annotations

import re
from typing import Dict, Optional

from app.services.scorer_result import ScorerResult


def score_exact_match(
    expected_text: Optional[str],
    actual_text: str,
    config: Optional[Dict] = None,
) -> ScorerResult:
    """Compare normalized text, optionally preserving case and whitespace."""
    if expected_text is None:
        return ScorerResult(scorer_name="exact_match", score=None)

    settings = config or {}
    case_sensitive = settings.get("case_sensitive", False)
    normalize_whitespace = settings.get("normalize_whitespace", True)
    expected = expected_text
    actual = actual_text

    if normalize_whitespace:
        expected = " ".join(expected.strip().split())
        actual = " ".join(actual.strip().split())
    if not case_sensitive:
        expected = expected.lower()
        actual = actual.lower()

    return ScorerResult(
        scorer_name="exact_match",
        score=1.0 if expected == actual else 0.0,
    )


def score_contains(
    expected_text: Optional[str],
    actual_text: str,
    config: Optional[Dict] = None,
) -> ScorerResult:
    """Check whether the expected text occurs in the produced output."""
    if expected_text is None:
        return ScorerResult(scorer_name="contains", score=None)

    settings = config or {}
    expected = expected_text
    actual = actual_text
    if not settings.get("case_sensitive", False):
        expected = expected.lower()
        actual = actual.lower()

    return ScorerResult(
        scorer_name="contains",
        score=1.0 if expected in actual else 0.0,
    )


def score_regex_match(
    pattern: Optional[str],
    actual_text: str,
    config: Optional[Dict] = None,
) -> ScorerResult:
    """Match output text using a regex and optional i/m/s flags."""
    if pattern is None:
        return ScorerResult(scorer_name="regex_match", score=None)

    flags_text = (config or {}).get("flags", "")
    flags = 0
    if "i" in flags_text:
        flags |= re.IGNORECASE
    if "m" in flags_text:
        flags |= re.MULTILINE
    if "s" in flags_text:
        flags |= re.DOTALL

    try:
        match = re.search(pattern, actual_text, flags)
    except re.error as error:
        return ScorerResult(
            scorer_name="regex_match",
            score=None,
            details={"error": f"Invalid regex: {error}"},
        )

    return ScorerResult(
        scorer_name="regex_match",
        score=1.0 if match else 0.0,
        details={"matched": bool(match), "pattern": pattern},
    )
