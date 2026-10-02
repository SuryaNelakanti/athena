"""Compatibility facade for prompt-test input formatting and execution."""

from typing import Any, List, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.proxy import ChatMessage
from app.services.prompt_test_executor import execute_prompt_test as execute_prompt_test_run
from app.services.prompt_test_input import (
    input_context_from_messages,
    messages_from_row_input,
    render_prompt_template,
    stringify_row_input,
)


class PromptTestService:
    def __init__(self, session: AsyncSession):
        self.session = session

    @staticmethod
    def _stringify_row_input(row_input: Any) -> str:
        return stringify_row_input(row_input)

    @staticmethod
    def _render_prompt_template(template: str, row_input: Any) -> str:
        return render_prompt_template(template, row_input)

    @staticmethod
    def _messages_from_row_input(
        row_input: Any,
        system_prompt: str,
        prompt_template: Optional[str] = None,
    ) -> List[ChatMessage]:
        return messages_from_row_input(row_input, system_prompt, prompt_template)

    @staticmethod
    def _input_context_from_messages(messages: List[ChatMessage]) -> str:
        return input_context_from_messages(messages)

    @staticmethod
    async def execute_prompt_test(prompt_test_id: str) -> None:
        await execute_prompt_test_run(prompt_test_id)
