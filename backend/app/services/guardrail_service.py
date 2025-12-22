"""
Guardrail Service - Runtime protection for AI outputs.

Guardrails check outputs before they're returned to users, providing:
- Block: Prevent response from being sent
- Warn: Add warning metadata to response
- Flag: Allow response but log for human review
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import or_
from sqlmodel import select

from app.models import GuardrailModel, DatasetModel, DatasetRowModel


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


class GuardrailService:
    """Service for checking outputs against guardrails."""
    
    def __init__(self, session: AsyncSession, project_id: str):
        self.session = session
        self.project_id = project_id
    
    def _normalize_text(self, value: str) -> str:
        """Normalize text for comparison."""
        return " ".join(value.strip().lower().split())
    
    async def check_output(self, output_text: str) -> GuardrailResult:
        """
        Check output against all enabled guardrails for the project.
        
        Returns GuardrailResult indicating whether the output should be blocked, warned, or allowed.
        """
        # Fetch enabled guardrails ordered by priority
        stmt = select(GuardrailModel).where(
            GuardrailModel.project_id == self.project_id,
            GuardrailModel.enabled == True
        ).order_by(GuardrailModel.priority.desc())
        
        result = await self.session.execute(stmt)
        guardrails = result.scalars().all()
        
        if not guardrails:
            return GuardrailResult(
                passed=True,
                action="allow",
                triggered_guardrails=[],
                warnings=[]
            )
        
        triggered = []
        warnings = []
        should_block = False
        
        normalized_output = self._normalize_text(output_text)
        
        for guardrail in guardrails:
            match = await self._check_guardrail(guardrail, output_text, normalized_output)
            
            if match["triggered"]:
                triggered.append({
                    "guardrail_id": guardrail.id,
                    "name": guardrail.name,
                    "action": guardrail.action,
                    "reason": match["reason"]
                })
                
                if guardrail.action == "block":
                    should_block = True
                elif guardrail.action == "warn":
                    warnings.append(f"{guardrail.name}: {match['reason']}")
        
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
    ) -> Dict[str, Any]:
        """Check if a single guardrail is triggered."""
        condition_type = guardrail.condition_type
        config = guardrail.condition_config or {}
        
        if condition_type == "anti_pattern":
            return await self._check_anti_pattern(config, normalized_output)
        elif condition_type == "keyword":
            return self._check_keyword(config, normalized_output)
        elif condition_type == "regex":
            return self._check_regex(config, output_text)
        
        return {"triggered": False, "reason": None}
    
    async def _check_anti_pattern(
        self, 
        config: Dict, 
        normalized_output: str
    ) -> Dict[str, Any]:
        """Check if output matches any specified anti-patterns."""
        pattern_ids = config.get("pattern_ids", [])
        threshold = config.get("threshold", 0.7)
        
        if not pattern_ids:
            # Check all anti-patterns in project datasets
            dataset_stmt = select(DatasetModel).where(DatasetModel.project_id == self.project_id)
            dataset_result = await self.session.execute(dataset_stmt)
            datasets = dataset_result.scalars().all()
            
            if not datasets:
                return {"triggered": False, "reason": None}
            
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
            
            # Substring check
            if pattern_normalized in normalized_output or normalized_output in pattern_normalized:
                return {
                    "triggered": True,
                    "reason": f"Output matches anti-pattern (substring match)"
                }
            
            # Word overlap
            output_words = set(normalized_output.split())
            pattern_words = set(pattern_normalized.split())
            
            if output_words and pattern_words:
                overlap = len(output_words & pattern_words) / max(len(output_words), len(pattern_words))
                if overlap >= threshold:
                    return {
                        "triggered": True,
                        "reason": f"Output resembles anti-pattern ({overlap:.0%} similarity)"
                    }
        
        return {"triggered": False, "reason": None}
    
    def _check_keyword(self, config: Dict, normalized_output: str) -> Dict[str, Any]:
        """Check if output contains blocked keywords."""
        keywords = config.get("keywords", [])
        
        for keyword in keywords:
            if self._normalize_text(keyword) in normalized_output:
                return {"triggered": True, "reason": f"Contains blocked keyword: '{keyword}'"}
        
        return {"triggered": False, "reason": None}
    
    def _check_regex(self, config: Dict, output_text: str) -> Dict[str, Any]:
        """Check if output matches blocked regex pattern."""
        import re
        
        patterns = config.get("patterns", [])
        
        for pattern in patterns:
            try:
                if re.search(pattern, output_text, re.IGNORECASE):
                    return {"triggered": True, "reason": f"Matches blocked pattern: '{pattern}'"}
            except re.error:
                continue
        
        return {"triggered": False, "reason": None}
