"""Build judge input messages for prompt-test dataset rows."""

from __future__ import annotations

import json
import re
from typing import Any, List, Optional

from app.schemas.proxy import ChatMessage


def stringify_row_input(row_input: Any) -> str:
    """Convert prompt-test row input to text for template substitution."""
    if isinstance(row_input, dict):
        return json.dumps(row_input, ensure_ascii=False)
    return str(row_input)


def render_prompt_template(template: str, row_input: Any) -> str:
    """Render `{{key}}` and `{{input}}` placeholders from a row."""
    if not template:
        return stringify_row_input(row_input)

    if isinstance(row_input, dict):
        rendered = template
        for match in re.findall(r'\{\{([^}]+)\}\}', template):
            key = match.strip()
            value = row_input.get(key, "")
            rendered = rendered.replace(f"{{{{{key}}}}}", str(value))
        rendered = rendered.replace("{{input}}", json.dumps(row_input, ensure_ascii=False))
        return rendered

    return template.replace("{{input}}", str(row_input))


def messages_from_row_input(
    row_input: Any,
    system_prompt: str,
    prompt_template: Optional[str] = None,
) -> List[ChatMessage]:
    """Construct chat messages from a prompt-test row and configuration."""
    user_content = render_prompt_template(prompt_template or "{{input}}", row_input)
    messages = []
    if system_prompt:
        messages.append(ChatMessage(role="system", content=system_prompt))
    messages.append(ChatMessage(role="user", content=user_content))
    return messages


def input_context_from_messages(messages: List[ChatMessage]) -> str:
    """Join message roles and content into the judge's input context."""
    return "\n".join([f"{message.role}: {message.content}" for message in messages])
