"""Accumulate row scores, usage, and latency into a run summary."""

from __future__ import annotations

from typing import Any, Optional

from app.models import ExperimentRunModel
from app.schemas.proxy import Usage


class ExperimentRunSummary:
    def __init__(self, scorer_configs: list[dict[str, Any]]):
        self.scorer_configs = scorer_configs
        self.scored_values: dict[str, list[float]] = {}

    def add_result(
        self,
        run: ExperimentRunModel,
        scores: dict[str, Any],
        usage: Optional[Usage],
        latency_ms: float,
    ) -> None:
        for name, value in scores.items():
            if not name.endswith("_details") and isinstance(value, (int, float)):
                self.scored_values.setdefault(name, []).append(float(value))

        summary = run.summary or {}
        primary = next(
            (
                config.get("type")
                for config in self.scorer_configs
                if config.get("is_primary")
            ),
            None,
        )
        if not primary and self.scorer_configs:
            primary = self.scorer_configs[0].get("type", "exact_match")
        primary = primary or "exact_match"
        primary_values = self.scored_values.get(primary, [])
        avg_score = sum(primary_values) / len(primary_values) if primary_values else 0.0

        weighted_sum = 0.0
        total_weight = 0.0
        for config in self.scorer_configs:
            values = self.scored_values.get(config.get("type", ""), [])
            if values:
                weight = float(config.get("weight", 1.0))
                weighted_sum += (sum(values) / len(values)) * weight
                total_weight += weight

        scorer_averages = {
            f"avg_{name}": sum(values) / len(values)
            for name, values in self.scored_values.items()
            if values
        }
        run.summary = {
            **summary,
            "rows_done": int(summary.get("rows_done", 0) or 0) + 1,
            "rows_scored": int(summary.get("rows_scored", 0) or 0)
            + int(
                any(
                    isinstance(value, (int, float))
                    for name, value in scores.items()
                    if not name.endswith("_details")
                )
            ),
            "avg_score": float(avg_score),
            "weighted_avg_score": weighted_sum / total_weight if total_weight > 0 else 0.0,
            "primary_scorer": primary,
            **scorer_averages,
            "tokens_prompt": int(summary.get("tokens_prompt", 0) or 0)
            + int(getattr(usage, "prompt_tokens", 0) or 0),
            "tokens_completion": int(summary.get("tokens_completion", 0) or 0)
            + int(getattr(usage, "completion_tokens", 0) or 0),
            "tokens_total": int(summary.get("tokens_total", 0) or 0)
            + int(getattr(usage, "total_tokens", 0) or 0),
            "cost_total": float(summary.get("cost_total", 0.0) or 0.0)
            + float(getattr(usage, "cost", 0.0) or 0.0),
            "latency_ms_total": float(summary.get("latency_ms_total", 0.0) or 0.0) + latency_ms,
        }
