"""Shared text normalization and overlap rules for anti-pattern scorers."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Optional


@dataclass(frozen=True)
class TextPatternMatch:
    similarity: float
    method: Literal["substring", "word_overlap"]


def normalize_text(value: str) -> str:
    return " ".join(value.strip().lower().split())


def match_normalized_text(
    actual_text: str,
    pattern_text: str,
    threshold: float,
) -> Optional[TextPatternMatch]:
    if not pattern_text:
        return None
    if pattern_text in actual_text or actual_text in pattern_text:
        return TextPatternMatch(similarity=0.9, method="substring")

    actual_words = set(actual_text.split())
    pattern_words = set(pattern_text.split())
    if not actual_words or not pattern_words:
        return None

    overlap = len(actual_words & pattern_words) / max(len(actual_words), len(pattern_words))
    if overlap >= threshold:
        return TextPatternMatch(similarity=overlap, method="word_overlap")
    return None
