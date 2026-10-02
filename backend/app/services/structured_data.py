from collections.abc import Mapping


def extract_expected_text(value: object) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if not isinstance(value, Mapping):
        return None

    for key in ("content", "answer", "text", "expected"):
        candidate = value.get(key)
        if isinstance(candidate, str):
            return candidate

    choices = value.get("choices")
    if not isinstance(choices, list) or not choices:
        return None

    choice = choices[0]
    if not isinstance(choice, Mapping):
        return None
    message = choice.get("message")
    if not isinstance(message, Mapping):
        return None
    content = message.get("content")
    return content if isinstance(content, str) else None
