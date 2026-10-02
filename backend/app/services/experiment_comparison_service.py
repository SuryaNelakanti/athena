from __future__ import annotations

from typing import Any, Optional, Sequence

from app.models import (
    DatasetRowModel,
    ExperimentRunModel,
    ExperimentRunResultModel,
    ExperimentVersionModel,
)


def _output_text(result: Optional[ExperimentRunResultModel]) -> Optional[str]:
    if result is None:
        return None
    output = result.output or {}
    if isinstance(output, dict):
        for key in ("output_text", "content"):
            value = output.get(key)
            if isinstance(value, str):
                return value
    return str(output) if output else None


def _trace_id(result: Optional[ExperimentRunResultModel]) -> Optional[str]:
    if result is None:
        return None
    output = result.output or {}
    return output.get("athena_trace_id") if isinstance(output, dict) else None


def _numeric_delta(baseline: dict[str, Any], candidate: dict[str, Any]) -> dict[str, float]:
    deltas = {}
    for key in set(baseline) | set(candidate):
        baseline_value = baseline.get(key)
        candidate_value = candidate.get(key)
        if isinstance(baseline_value, (int, float)) and isinstance(candidate_value, (int, float)):
            deltas[key] = candidate_value - baseline_value
    return deltas


def _primary_scorer(version: ExperimentVersionModel) -> str:
    scorers = (version.config or {}).get("scorers", [])
    primary_scorer = None
    for scorer in scorers:
        if isinstance(scorer, dict) and scorer.get("is_primary"):
            primary_scorer = scorer.get("type")
            break
    if not primary_scorer and scorers:
        first_scorer = scorers[0]
        primary_scorer = first_scorer.get("type") if isinstance(first_scorer, dict) else first_scorer
    return primary_scorer or "exact_match"


def _scorer_types(*versions: ExperimentVersionModel) -> set[str]:
    scorer_types = set()
    for version in versions:
        for scorer in (version.config or {}).get("scorers", []):
            if isinstance(scorer, dict) and scorer.get("type"):
                scorer_types.add(scorer["type"])
    return scorer_types


def _row_comparison(
    row_id: str,
    baseline: Optional[ExperimentRunResultModel],
    candidate: Optional[ExperimentRunResultModel],
    row: Optional[DatasetRowModel],
    primary_scorer: str,
) -> tuple[dict[str, Any], str]:
    baseline_scores = baseline.scores if baseline else {}
    candidate_scores = candidate.scores if candidate else {}
    baseline_score = baseline_scores.get(primary_scorer) if isinstance(baseline_scores, dict) else None
    candidate_score = candidate_scores.get(primary_scorer) if isinstance(candidate_scores, dict) else None

    status = "unchanged"
    if isinstance(baseline_score, (int, float)) and isinstance(candidate_score, (int, float)):
        score_delta = candidate_score - baseline_score
        if score_delta > 0.01:
            status = "improved"
        elif score_delta < -0.01:
            status = "regressed"

    row_diff = {
        "dataset_row_id": row_id,
        "logical_id": getattr(row, "logical_id", None),
        "input": row.input if row else None,
        "expected": row.expected if row else None,
        "baseline": {
            "scores": baseline_scores,
            "output": baseline.output if baseline else None,
            "output_text": _output_text(baseline),
            "trace_id": _trace_id(baseline),
            "latency_ms": baseline.latency_ms if baseline else None,
        },
        "candidate": {
            "scores": candidate_scores,
            "output": candidate.output if candidate else None,
            "output_text": _output_text(candidate),
            "trace_id": _trace_id(candidate),
            "latency_ms": candidate.latency_ms if candidate else None,
        },
        "delta_scores": _numeric_delta(baseline_scores, candidate_scores),
        "status": status,
    }
    return row_diff, status


def build_experiment_comparison(
    baseline_run: ExperimentRunModel,
    candidate_run: ExperimentRunModel,
    baseline_version: ExperimentVersionModel,
    candidate_version: ExperimentVersionModel,
    baseline_results: Sequence[ExperimentRunResultModel],
    candidate_results: Sequence[ExperimentRunResultModel],
    rows_by_id: dict[str, DatasetRowModel],
) -> dict[str, Any]:
    primary_scorer = _primary_scorer(candidate_version)
    baseline_by_row = {result.dataset_row_id: result for result in baseline_results}
    candidate_by_row = {result.dataset_row_id: result for result in candidate_results}

    row_diffs = []
    status_counts = {"improved": 0, "regressed": 0, "unchanged": 0}
    for row_id in set(baseline_by_row) | set(candidate_by_row):
        row_diff, status = _row_comparison(
            row_id,
            baseline_by_row.get(row_id),
            candidate_by_row.get(row_id),
            rows_by_id.get(row_id),
            primary_scorer,
        )
        row_diffs.append(row_diff)
        status_counts[status] += 1

    baseline_summary = baseline_run.summary or {}
    candidate_summary = candidate_run.summary or {}
    per_scorer = {}
    for scorer_type in _scorer_types(candidate_version, baseline_version):
        baseline_average = baseline_summary.get(f"avg_{scorer_type}")
        candidate_average = candidate_summary.get(f"avg_{scorer_type}")
        delta = None
        if isinstance(baseline_average, (int, float)) and isinstance(candidate_average, (int, float)):
            delta = candidate_average - baseline_average
        per_scorer[scorer_type] = {
            "baseline": baseline_average,
            "candidate": candidate_average,
            "delta": delta,
        }

    return {
        "baseline_run": baseline_run,
        "candidate_run": candidate_run,
        "primary_scorer": primary_scorer,
        "delta_summary": {
            **_numeric_delta(baseline_summary, candidate_summary),
            "per_scorer": per_scorer,
            "improved_count": status_counts["improved"],
            "regressed_count": status_counts["regressed"],
            "unchanged_count": status_counts["unchanged"],
        },
        "rows": row_diffs,
    }
