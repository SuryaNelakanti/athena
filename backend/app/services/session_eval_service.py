from __future__ import annotations

from dataclasses import dataclass
import uuid
from typing import Any, Dict, List, Optional

from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.models import (
    AgentSessionModel,
    AgentRunModel,
    AgentSessionEvalModel,
    SpanModel,
)
from app.services.scorer_service import ScorerService
from app.services.session_eval_scorers import (
    extract_telemetry_text,
    score_outcome,
    score_path_efficiency,
    score_tool_correctness,
)
from app.services.trace_service import extract_trace_io


def _run_sort_key(run: AgentRunModel) -> int:
    if run.ended_at:
        return run.ended_at
    if run.started_at:
        return run.started_at
    return run.created_at


@dataclass(frozen=True)
class _EvaluationTraceData:
    spans: list[SpanModel]
    input_data: Any
    output_data: Any
    input_span_id: Optional[str]
    output_span_id: Optional[str]
    input_text: str
    output_text: str


class SessionEvalService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create_eval(
        self,
        session_id: str,
        run_id: Optional[str],
        scorers: Optional[List[Dict[str, Any]]],
        rubric: Optional[Dict[str, Any]],
        expected: Any,
        input_override: Any,
    ) -> AgentSessionEvalModel:
        db_session, db_run = await self._resolve_session_run(session_id, run_id)
        trace_data = await self._load_trace_data(db_run, input_override)
        scorer_configs = scorers or [
            {"type": "tool_correctness"},
            {"type": "path_efficiency"},
        ]
        if expected is not None and not any(
            config.get("type") == "outcome" for config in scorer_configs
        ):
            scorer_configs.append(
                {"type": "outcome", "task_type": "classification", "expected": expected}
            )

        rubric_data = rubric or {}
        scores, failing_nodes = await self._score(
            db_session.project_id,
            trace_data,
            scorer_configs,
            rubric_data,
            expected,
        )
        return await self._persist_eval(
            db_session,
            db_run.id,
            trace_data,
            scorer_configs,
            rubric_data,
            scores,
            failing_nodes,
        )

    async def _resolve_session_run(
        self,
        session_id: str,
        run_id: Optional[str],
    ) -> tuple[AgentSessionModel, AgentRunModel]:
        db_session = await self.session.get(AgentSessionModel, session_id)
        if not db_session:
            raise ValueError("Session not found")

        if run_id:
            db_run = await self.session.get(AgentRunModel, run_id)
            if not db_run or db_run.session_id != session_id:
                raise ValueError("Run not found for session")
        else:
            result = await self.session.execute(
                select(AgentRunModel).where(AgentRunModel.session_id == session_id)
            )
            runs = result.scalars().all()
            if not runs:
                raise ValueError("Session has no runs")
            db_run = max(runs, key=_run_sort_key)

        if not db_run.trace_id:
            raise ValueError("Run has no trace_id")
        return db_session, db_run

    async def _load_trace_data(
        self,
        run: AgentRunModel,
        input_override: Any,
    ) -> _EvaluationTraceData:
        result = await self.session.execute(
            select(SpanModel).where(SpanModel.trace_id == run.trace_id)
        )
        spans = result.scalars().all()
        if not spans:
            raise ValueError("Trace has no spans")

        input_data, output_data, input_span_id, output_span_id = await extract_trace_io(
            self.session,
            run.trace_id,
        )
        if input_override is not None:
            input_data = input_override

        input_text = extract_telemetry_text(
            input_data,
            ["prompt", "input", "question", "text", "query"],
        )
        output_text = extract_telemetry_text(
            output_data,
            ["output_text", "text", "content", "answer", "response", "value"],
        )
        return _EvaluationTraceData(
            spans=spans,
            input_data=input_data,
            output_data=output_data,
            input_span_id=input_span_id,
            output_span_id=output_span_id,
            input_text=input_text,
            output_text=output_text,
        )

    async def _score(
        self,
        project_id: str,
        trace_data: _EvaluationTraceData,
        scorer_configs: list[dict[str, Any]],
        rubric: dict[str, Any],
        expected: Any,
    ) -> tuple[Dict[str, Any], set[str]]:
        scores: Dict[str, Any] = {}
        failing_nodes: set[str] = set()

        for scorer_config in scorer_configs:
            scorer_type = scorer_config.get("type", "tool_correctness")
            config = {key: value for key, value in scorer_config.items() if key != "type"}
            if scorer_type == "tool_correctness":
                score, details, failing = score_tool_correctness(trace_data.spans, config)
                if score is not None:
                    scores["tool_correctness"] = score
                scores["tool_correctness_details"] = details
                failing_nodes.update(failing)
            elif scorer_type == "path_efficiency":
                score, details, failing = score_path_efficiency(trace_data.spans, config)
                if score is not None:
                    scores["path_efficiency"] = score
                scores["path_efficiency_details"] = details
                failing_nodes.update(failing)
            elif scorer_type == "outcome":
                if config.get("expected") is None and expected is not None:
                    config["expected"] = expected
                score, details, failing = score_outcome(
                    trace_data.output_data,
                    trace_data.output_text,
                    trace_data.output_span_id,
                    config,
                )
                if score is not None:
                    scores["outcome"] = score
                scores["outcome_details"] = details
                failing_nodes.update(failing)
            elif scorer_type == "llm_judge":
                if "criteria" not in config and rubric.get("criteria"):
                    config["criteria"] = rubric["criteria"]
                result = await ScorerService(
                    self.session,
                    project_id=project_id,
                ).run_scorer(
                    scorer_type="llm_judge",
                    expected=expected,
                    actual_text=trace_data.output_text,
                    input_text=trace_data.input_text,
                    config=config,
                )
                if result.score is not None:
                    scores["llm_judge"] = result.score
                if result.details:
                    scores["llm_judge_details"] = result.details
            else:
                scores[f"{scorer_type}_details"] = {"error": "unknown scorer"}

        return scores, failing_nodes

    async def _persist_eval(
        self,
        db_session: AgentSessionModel,
        run_id: str,
        trace_data: _EvaluationTraceData,
        scorer_configs: list[dict[str, Any]],
        rubric: dict[str, Any],
        scores: Dict[str, Any],
        failing_nodes: set[str],
    ) -> AgentSessionEvalModel:
        numeric_scores = [
            value
            for key, value in scores.items()
            if not key.endswith("_details") and isinstance(value, (int, float))
        ]
        avg_score = float(sum(numeric_scores) / len(numeric_scores)) if numeric_scores else None

        version_result = await self.session.execute(
            select(func.max(AgentSessionEvalModel.version)).where(
                AgentSessionEvalModel.session_id == db_session.id
            )
        )
        version = int(version_result.scalar() or 0) + 1
        summary = {
            "avg_score": avg_score,
            "score_count": len(numeric_scores),
            "failing_node_ids": sorted(failing_nodes),
            "input_span_id": trace_data.input_span_id,
            "output_span_id": trace_data.output_span_id,
        }
        evaluation = AgentSessionEvalModel(
            id=f"seval_{uuid.uuid4().hex[:16]}",
            session_id=db_session.id,
            project_id=db_session.project_id,
            run_id=run_id,
            version=version,
            rubric=rubric,
            scorers=scorer_configs,
            scores=scores,
            summary=summary,
        )
        self.session.add(evaluation)
        return evaluation
