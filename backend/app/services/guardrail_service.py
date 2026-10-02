"""
Guardrail Service - Runtime protection for AI outputs.

Guardrails check outputs before they're returned to users, providing:
- Block: Prevent response from being sent
- Warn: Add warning metadata to response
- Flag: Allow response but log for human review
"""

from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Any, Dict, List, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import or_
from sqlmodel import select

from app.models import GuardrailModel, DatasetModel, DatasetRowModel
from app.services.anti_pattern_matching import match_normalized_text, normalize_text


@dataclass
class GuardrailResult:
    """Result from guardrail evaluation."""
    passed: bool
    action: str  # "allow", "block", "warn", "flag"
    triggered_guardrails: List[Dict[str, Any]]
    warnings: List[str]
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "passed": self.passed,
            "action": self.action,
            "triggered_guardrails": self.triggered_guardrails,
            "warnings": self.warnings
        }


@dataclass(frozen=True)
class GuardrailMatch:
    triggered: bool
    reason: Optional[str] = None


class GuardrailService:
    """Service for checking outputs against guardrails."""
    
    def __init__(self, session: AsyncSession, project_id: str):
        self.session = session
        self.project_id = project_id
    
    def _normalize_text(self, value: str) -> str:
        """Normalize text for comparison."""
        return normalize_text(value)
    
    async def check_output(self, output_text: str) -> GuardrailResult:
        """
        Check output against all enabled guardrails for the project.
        
        Returns GuardrailResult indicating whether the output should be blocked, warned, or allowed.
        """
        guardrails = await self._load_enabled_guardrails()
        if not guardrails:
            return self._result_for_triggers([], [], should_block=False)

        triggered: list[Dict[str, Any]] = []
        warnings: list[str] = []
        should_block = False
        normalized_output = self._normalize_text(output_text)
        for guardrail in guardrails:
            match = await self._check_guardrail(guardrail, output_text, normalized_output)
            if match.triggered:
                triggered.append({
                    "guardrail_id": guardrail.id,
                    "name": guardrail.name,
                    "action": guardrail.action,
                    "reason": match.reason
                })
                
                if guardrail.action == "block":
                    should_block = True
                elif guardrail.action == "warn":
                    warnings.append(f"{guardrail.name}: {match.reason}")

        return self._result_for_triggers(triggered, warnings, should_block)

    async def _load_enabled_guardrails(self) -> list[GuardrailModel]:
        statement = select(GuardrailModel).where(
            GuardrailModel.project_id == self.project_id,
            GuardrailModel.enabled.is_(True)
        ).order_by(GuardrailModel.priority.desc())
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    def _result_for_triggers(
        self,
        triggered: List[Dict[str, Any]],
        warnings: List[str],
        should_block: bool,
    ) -> GuardrailResult:
        if should_block:
            return GuardrailResult(
                passed=False,
                action="block",
                triggered_guardrails=triggered,
                warnings=warnings
            )
        
        if warnings:
            return GuardrailResult(
                passed=True,
                action="warn",
                triggered_guardrails=triggered,
                warnings=warnings
            )
        
        if triggered:  # flag_for_review cases
            return GuardrailResult(
                passed=True,
                action="flag",
                triggered_guardrails=triggered,
                warnings=[]
            )
        
        return GuardrailResult(
            passed=True,
            action="allow",
            triggered_guardrails=[],
            warnings=[]
        )
    
    async def _check_guardrail(
        self, 
        guardrail: GuardrailModel, 
        output_text: str,
        normalized_output: str
    ) -> GuardrailMatch:
        """Check if a single guardrail is triggered."""
        condition_type = guardrail.condition_type
        config = guardrail.condition_config or {}
        
        if condition_type == "anti_pattern":
            return await self._check_anti_pattern(config, normalized_output)
        elif condition_type == "keyword":
            return self._check_keyword(config, normalized_output)
        elif condition_type == "regex":
            return self._check_regex(config, output_text)
        
        return GuardrailMatch(triggered=False)
    
    async def _check_anti_pattern(
        self, 
        config: Dict, 
        normalized_output: str
    ) -> GuardrailMatch:
        """Check if output matches any specified anti-patterns."""
        pattern_ids = config.get("pattern_ids", [])
        threshold = config.get("threshold", 0.7)
        
        if not pattern_ids:
            # Check all anti-patterns in project datasets
            dataset_stmt = select(DatasetModel).where(DatasetModel.project_id == self.project_id)
            dataset_result = await self.session.execute(dataset_stmt)
            datasets = dataset_result.scalars().all()
            
            if not datasets:
                return GuardrailMatch(triggered=False)
            
            dataset_ids = [d.id for d in datasets]
            row_stmt = select(DatasetRowModel).where(
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
            row_result = await self.session.execute(row_stmt)
            patterns = row_result.scalars().all()
        else:
            # Check specific patterns by ID
            row_stmt = select(DatasetRowModel).where(DatasetRowModel.id.in_(pattern_ids))
            row_result = await self.session.execute(row_stmt)
            patterns = row_result.scalars().all()
        
        for pattern in patterns:
            expected = pattern.expected or {}
            pattern_text = ""
            for key in ("answer", "text", "content", "expected"):
                if isinstance(expected.get(key), str):
                    pattern_text = expected[key]
                    break
            
            if not pattern_text:
                continue
            
            pattern_normalized = self._normalize_text(pattern_text)
            if not pattern_normalized:
                return GuardrailMatch(
                    triggered=True,
                    reason="Output matches anti-pattern (substring match)",
                )
            match = match_normalized_text(normalized_output, pattern_normalized, threshold)
            if not match:
                continue

            if match.method == "substring":
                return GuardrailMatch(
                    triggered=True,
                    reason="Output matches anti-pattern (substring match)",
                )
            return GuardrailMatch(
                triggered=True,
                reason=f"Output resembles anti-pattern ({match.similarity:.0%} similarity)",
            )
        
        return GuardrailMatch(triggered=False)

    def _check_keyword(self, config: Dict, normalized_output: str) -> GuardrailMatch:
        """Check if output contains blocked keywords."""
        keywords = config.get("keywords", [])
        
        for keyword in keywords:
            if self._normalize_text(keyword) in normalized_output:
                return GuardrailMatch(
                    triggered=True,
                    reason=f"Contains blocked keyword: '{keyword}'",
                )
        
        return GuardrailMatch(triggered=False)

    def _check_regex(self, config: Dict, output_text: str) -> GuardrailMatch:
        """Check if output matches blocked regex pattern."""
        patterns = config.get("patterns", [])
        
        for pattern in patterns:
            try:
                if re.search(pattern, output_text, re.IGNORECASE):
                    return GuardrailMatch(
                        triggered=True,
                        reason=f"Matches blocked pattern: '{pattern}'",
                    )
            except re.error:
                continue
        
        return GuardrailMatch(triggered=False)
