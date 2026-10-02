import logging
import os
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.providers.factory import get_envoy, normalize_provider_name, resolve_provider_for_model
from app.schemas.proxy import ModelCard, ProviderConfig, Usage
from app.services.provider_keys import ProviderKeyStore

logger = logging.getLogger(__name__)


class ProxyProviderService:
    """Resolve provider configuration, model catalogs, and usage cost."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def provider_config(
        self,
        provider_name: str,
        org_id: Optional[str] = None,
        project_id: Optional[str] = None,
    ) -> ProviderConfig | None:
        api_key = await ProviderKeyStore.get_durable_key(
            self.session,
            provider_name,
            org_id=org_id,
            project_id=project_id,
        )
        if not api_key:
            return None
        return ProviderConfig(provider_name=provider_name, api_key=api_key)

    def resolve_provider(self, provider_name: Optional[str], model: str) -> str:
        if provider_name:
            return normalize_provider_name(provider_name)
        return resolve_provider_for_model(model)

    def estimate_cost(self, usage: Optional[Usage]) -> Optional[float]:
        if not usage:
            return None
        if usage.cost is not None:
            return usage.cost

        prompt_rate = self.env_float("ATHENA_COST_PROMPT_PER_1K")
        completion_rate = self.env_float("ATHENA_COST_COMPLETION_PER_1K")
        total_rate = self.env_float("ATHENA_COST_TOTAL_PER_1K")

        prompt_tokens = usage.prompt_tokens or 0
        completion_tokens = usage.completion_tokens or 0
        total_tokens = usage.total_tokens or (prompt_tokens + completion_tokens)

        if prompt_rate is not None or completion_rate is not None:
            cost = 0.0
            if prompt_rate is not None:
                cost += (prompt_tokens / 1000.0) * prompt_rate
            if completion_rate is not None:
                cost += (completion_tokens / 1000.0) * completion_rate
            return cost

        if total_rate is not None:
            return (total_tokens / 1000.0) * total_rate

        return None

    async def list_models(self) -> list[ModelCard]:
        providers = ["openai", "anthropic", "gemini", "groq", "mock"]
        all_models: list[ModelCard] = []

        for provider_name in providers:
            try:
                config = await self.provider_config(provider_name)
                envoy = get_envoy(provider_name, config)
                model_ids = await envoy.list_models()
                all_models.extend(
                    ModelCard(id=model_id, owned_by=provider_name)
                    for model_id in model_ids
                )
            except Exception:
                logger.exception("Failed to list models for provider %s", provider_name)

        return all_models

    @staticmethod
    def env_float(key: str) -> Optional[float]:
        raw = os.getenv(key)
        if raw is None:
            return None
        raw = raw.strip()
        if not raw:
            return None
        try:
            return float(raw)
        except ValueError:
            return None
