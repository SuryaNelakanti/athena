"""Validate and normalize the persisted configuration for an experiment run."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, Optional


class ExperimentRunConfigurationError(ValueError):
    """Raised when a saved experiment version cannot be executed."""


@dataclass
class ExperimentRunConfig:
    provider: str
    model_id: str
    system_prompt: str
    prompt_template: Optional[str]
    scorers: list[dict[str, Any]]
    temperature: float
    max_tokens: Any
    top_p: Any
    frequency_penalty: Any
    presence_penalty: Any
    stop_sequences: Any
    seed: Any

    @classmethod
    def from_version_config(cls, value: object) -> "ExperimentRunConfig":
        version_config = value if isinstance(value, Mapping) else {}
        raw_model_config = version_config.get("model", {})
        raw_task_config = version_config.get("task", {})
        raw_scorers_config = version_config.get("scorers", [{"type": "exact_match"}])

        if not isinstance(raw_model_config, Mapping):
            raise ExperimentRunConfigurationError("Model config must be an object")
        if not isinstance(raw_task_config, Mapping):
            raise ExperimentRunConfigurationError("Task config must be an object")
        if not isinstance(raw_scorers_config, list) or any(
            not isinstance(scorer_config, Mapping) for scorer_config in raw_scorers_config
        ):
            raise ExperimentRunConfigurationError("Scorer config must be a list of objects")

        provider_value = raw_model_config.get("provider")
        model_id_value = raw_model_config.get("id")
        if (
            not isinstance(provider_value, str)
            or not provider_value.strip()
            or not isinstance(model_id_value, str)
            or not model_id_value.strip()
        ):
            raise ExperimentRunConfigurationError("Model config missing provider/id")

        temperature_value = raw_model_config.get("temperature")
        try:
            temperature = 1.0 if temperature_value is None else float(temperature_value)
        except (OverflowError, TypeError, ValueError) as error:
            raise ExperimentRunConfigurationError(
                "Model temperature must be a number"
            ) from error

        prompt_template = raw_task_config.get("prompt_template")
        if prompt_template is not None and not isinstance(prompt_template, str):
            prompt_template = str(prompt_template)

        return cls(
            provider=provider_value.strip(),
            model_id=model_id_value.strip(),
            system_prompt=str(raw_task_config.get("system_prompt") or ""),
            prompt_template=prompt_template,
            scorers=[dict(scorer_config) for scorer_config in raw_scorers_config],
            temperature=temperature,
            max_tokens=raw_model_config.get("max_tokens"),
            top_p=raw_model_config.get("top_p"),
            frequency_penalty=raw_model_config.get("frequency_penalty"),
            presence_penalty=raw_model_config.get("presence_penalty"),
            stop_sequences=raw_model_config.get("stop_sequences"),
            seed=raw_model_config.get("seed"),
        )
