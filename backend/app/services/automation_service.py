from __future__ import annotations

from typing import Any, Dict, List, Optional
import logging
import time
import uuid

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.models import (
    AgentRunModel,
    AgentSessionAnnotationModel,
    AutomationRuleModel,
    AutomationRunModel,
    ReviewItemModel,
)

logger = logging.getLogger(__name__)


def _now_ms() -> int:
    return int(time.time() * 1000)


class AutomationService:
    def __init__(self, session: AsyncSession):
        self.session = session

    def _matches(self, rule: AutomationRuleModel, source: Dict[str, Any]) -> bool:
        trigger = rule.trigger or {}
        trigger_type = trigger.get("type")
        if trigger_type == "run_status":
            return str(source.get("status", "")).lower() == str(trigger.get("status", "error")).lower()
        if trigger_type == "cost_above":
            return float(source.get("total_cost") or 0) > float(trigger.get("threshold") or 0)
        if trigger_type == "latency_above":
            return float(source.get("total_latency") or 0) > float(trigger.get("threshold") or 0)
        if trigger_type == "eval_score_below":
            scores = source.get("scores") or {}
            scorer = trigger.get("scorer")
            value = scores.get(scorer) if scorer else source.get("score")
            return value is not None and float(value) < float(trigger.get("threshold") or 0)
        return False

    async def evaluate_source(
        self,
        project_id: str,
        source_type: str,
        source_id: str,
        source: Dict[str, Any],
    ) -> List[AutomationRunModel]:
        result = await self.session.execute(
            select(AutomationRuleModel).where(
                AutomationRuleModel.project_id == project_id,
                AutomationRuleModel.enabled == True,  # noqa: E712
            )
        )
        rules = result.scalars().all()
        runs: List[AutomationRunModel] = []
        for rule in rules:
            if not self._matches(rule, source):
                continue
            run = await self._execute_rule(rule, source_type, source_id, source)
            runs.append(run)
        return runs

    async def evaluate_run(self, run: AgentRunModel) -> List[AutomationRunModel]:
        return await self.evaluate_source(
            project_id=run.project_id,
            source_type="run",
            source_id=run.id,
            source={
                "run_id": run.id,
                "session_id": run.session_id,
                "trace_id": run.trace_id,
                "status": run.status,
                "total_cost": run.total_cost,
                "total_latency": run.total_latency,
                "total_tokens": run.total_tokens,
            },
        )

    async def _execute_rule(
        self,
        rule: AutomationRuleModel,
        source_type: str,
        source_id: str,
        source: Dict[str, Any],
    ) -> AutomationRunModel:
        action_results = []
        now = _now_ms()
        for action in rule.actions or []:
            action_type = action.get("type")
            try:
                if action_type in {"create_review_item", "promote_to_dataset_queue"}:
                    await self._create_review_item(rule, action, source_type, source_id, source)
                    action_results.append({"type": action_type, "status": "completed"})
                elif action_type == "annotate_session" and source.get("session_id"):
                    annotation = AgentSessionAnnotationModel(
                        id=f"ann_{uuid.uuid4().hex[:16]}",
                        session_id=source["session_id"],
                        project_id=rule.project_id,
                        labels=action.get("labels") or ["automation"],
                        severity=action.get("severity"),
                        owner=action.get("owner"),
                        status="open",
                        note=action.get("note") or f"Created by automation rule {rule.name}",
                        created_at=now,
                        updated_at=now,
                    )
                    self.session.add(annotation)
                    action_results.append({"type": action_type, "status": "completed", "annotation_id": annotation.id})
                elif action_type == "tag_session":
                    action_results.append({"type": action_type, "status": "recorded", "tags": action.get("tags") or []})
                elif action_type == "webhook":
                    action_results.append({"type": action_type, "status": "queued", "url": action.get("url")})
                else:
                    action_results.append({"type": action_type, "status": "skipped", "reason": "unsupported action"})
            except Exception as error:
                logger.warning(
                    "Automation action failed for rule %s (%s)",
                    rule.id,
                    type(error).__name__,
                )
                action_results.append({
                    "type": action_type,
                    "status": "error",
                    "error": "Automation action failed",
                })

        run = AutomationRunModel(
            id=f"arun_{uuid.uuid4().hex[:16]}",
            rule_id=rule.id,
            project_id=rule.project_id,
            source_type=source_type,
            source_id=source_id,
            status="completed" if all(item.get("status") != "error" for item in action_results) else "error",
            trigger_snapshot={**(rule.trigger or {}), "source": source},
            action_results=action_results,
            created_at=now,
        )
        self.session.add(run)
        return run

    async def _create_review_item(
        self,
        rule: AutomationRuleModel,
        action: Dict[str, Any],
        source_type: str,
        source_id: str,
        source: Dict[str, Any],
    ) -> None:
        existing = await self.session.execute(
            select(ReviewItemModel).where(
                ReviewItemModel.project_id == rule.project_id,
                ReviewItemModel.source_type == source_type,
                ReviewItemModel.source_id == source_id,
                ReviewItemModel.status.in_(["open", "in_review"]),
            )
        )
        if existing.scalars().first():
            return
        review = ReviewItemModel(
            id=f"rev_{uuid.uuid4().hex[:16]}",
            project_id=rule.project_id,
            source_type=source_type,
            source_id=source_id,
            priority=int(action.get("priority") or 0),
            labels=action.get("labels") or ["automation"],
            notes=action.get("note") or f"Created by automation rule {rule.name}",
            dataset_id=action.get("dataset_id"),
            meta={
                "automation_rule_id": rule.id,
                "automation_rule_name": rule.name,
                "trigger": rule.trigger,
                "source": source,
                "dataset_suggestion": action.get("type") == "promote_to_dataset_queue",
            },
        )
        self.session.add(review)
