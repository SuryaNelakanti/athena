"""Athena prompt tests persistence models."""

from typing import Dict, Optional

from sqlalchemy import Column
from sqlmodel import Field, JSON, SQLModel


class PromptTestModel(SQLModel, table=True):
    """
    A Prompt Test is a single unit of evaluation: run a prompt against a dataset
    and score the results. Replaces the Experiment → Version → Run hierarchy
    with a simpler model where each test is atomic and auto-saved.
    """
    __tablename__ = "prompt_test"

    id: str = Field(primary_key=True)  # "pt_abc123"
    dataset_id: str = Field(foreign_key="dataset.id", index=True)
    project_id: str = Field(foreign_key="project.id", index=True)
    name: Optional[str] = Field(default=None)

    # Execution state
    status: str = Field(default="queued", index=True)  # queued, running, completed, failed, cancelled

    # Prompt configuration
    prompt_config: Dict = Field(default_factory=dict, sa_column=Column(JSON))
    # Structure:
    # {
    #   "system_prompt": str,           # The actual prompt
    #   "prompt_template": str | None,  # Optional template with {{input}} placeholder
    #   "model_id": str,                # e.g., "gpt-4o"
    #   "provider": str,                # e.g., "openai"
    #   "model_registry_id": str | None,
    #   "temperature": float,
    #   "max_tokens": int | None,
    # }

    # Success criteria - how to judge if output is correct
    success_criteria: Dict = Field(default_factory=dict, sa_column=Column(JSON))
    # Structure:
    # {
    #   "type": str,                    # "llm_judge", "exact_match", "regex", "contains", "manual"
    #   "llm_judge_prompt": str | None, # For llm_judge: the judging criteria
    #   "regex_pattern": str | None,    # For regex: the pattern
    #   "keywords": list[str] | None,   # For contains: keywords to check
    #   "match_mode": str | None,       # For contains: "any" or "all"
    #   "case_sensitive": bool,
    #   "normalize_whitespace": bool,
    # }

    # Results summary (populated after completion)
    summary: Dict = Field(default_factory=dict, sa_column=Column(JSON))
    # Structure:
    # {
    #   "total_rows": int,
    #   "passed": int,
    #   "failed": int,
    #   "pending": int,  # For manual review
    #   "pass_rate": float,
    #   "tokens_total": int,
    #   "cost_total": float,
    #   "latency_avg_ms": float,
    # }

    # Timestamps
    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)
    updated_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)
    started_at: Optional[int] = Field(default=None)
    completed_at: Optional[int] = Field(default=None)


class PromptTestResultModel(SQLModel, table=True):
    """
    Per-row result for a prompt test. Stores the AI output, score, and
    (for LLM judge) the reasoning for why it passed or failed.
    """
    __tablename__ = "prompt_test_result"

    id: str = Field(primary_key=True, default_factory=lambda: f"ptr_{__import__('uuid').uuid4().hex[:12]}")
    prompt_test_id: str = Field(foreign_key="prompt_test.id", index=True)
    dataset_row_id: str = Field(foreign_key="dataset_row.id", index=True)

    # AI output (full payload from LLM response)
    output: Dict = Field(default_factory=dict, sa_column=Column(JSON))

    # Scores from all scorers
    scores: Dict = Field(default_factory=dict, sa_column=Column(JSON))

    # Metrics
    latency_ms: float = Field(default=0.0)

    # Error info (if any)
    error: Optional[str] = Field(default=None)

    created_at: int = Field(default_factory=lambda: int(__import__("time").time() * 1000), index=True)
