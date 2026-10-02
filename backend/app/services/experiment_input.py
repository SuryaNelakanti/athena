"""Normalize dataset row inputs into the chat messages used by experiments."""

from __future__ import annotations

from collections.abc import Mapping
import json
from typing import Optional

from app.schemas.proxy import ChatMessage


def stringify_row_input(row_input: object) -> str:
    if isinstance(row_input, Mapping):
        for key in ("prompt", "input", "text", "query"):
            value = row_input.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        try:
            return json.dumps(dict(row_input), ensure_ascii=True)
        except TypeError:
            return str(row_input)
    if isinstance(row_input, str):
        return row_input
    return ""


def render_prompt_template(prompt_template: str, row_input: object) -> str:
    input_text = stringify_row_input(row_input)
    if "{{input}}" in prompt_template:
        return prompt_template.replace("{{input}}", input_text)
    if input_text:
        return f"{prompt_template}\n\n{input_text}"
    return prompt_template


def messages_from_row_input(
    row_input: object,
    system_prompt: Optional[str],
    prompt_template: Optional[str] = None,
) -> list[ChatMessage]:
    messages: list[ChatMessage] = []
    if system_prompt:
        messages.append(ChatMessage(role="system", content=system_prompt))

    if isinstance(row_input, Mapping):
        raw_messages = row_input.get("messages")
        if isinstance(raw_messages, list):
            for message_data in raw_messages:
                if not isinstance(message_data, Mapping):
                    continue
                role = message_data.get("role")
                content = message_data.get("content")
                if isinstance(role, str) and isinstance(content, str):
                    messages.append(ChatMessage(role=role, content=content))
            if messages:
                return messages

    if prompt_template:
        rendered_prompt = render_prompt_template(prompt_template, row_input)
        messages.append(ChatMessage(role="user", content=rendered_prompt))
        return messages

    if isinstance(row_input, Mapping):
        for key in ("prompt", "input", "text", "query"):
            value = row_input.get(key)
            if isinstance(value, str) and value.strip():
                messages.append(ChatMessage(role="user", content=value))
                return messages

    if isinstance(row_input, str) and row_input.strip():
        messages.append(ChatMessage(role="user", content=row_input))
        return messages

    messages.append(ChatMessage(role="user", content=""))
    return messages
