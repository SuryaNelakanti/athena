from __future__ import annotations

import re
import time
from typing import Any, Optional

from app.services.aql_errors import AQLParseError


class AQLValueCodec:
    """Parse and format AQL literals without owning query-clause parsing."""

    @staticmethod
    def parse(raw: str) -> Any:
        if not raw:
            return ""

        if raw.lower().startswith("now()"):
            now_ms = int(time.time() * 1000)
            remainder = raw[5:].strip()
            if not remainder:
                return now_ms
            match = re.match(r"^([+-])\s*(\d+(?:\.\d+)?)$", remainder)
            if not match:
                raise AQLParseError(f"Invalid now() expression: {raw}")
            delta = float(match.group(2))
            if match.group(1) == "-":
                delta = -delta
            return now_ms + int(delta)

        if raw[0] in {"'", '"'} and raw[-1] == raw[0]:
            return raw[1:-1]

        is_list = raw.startswith("[") and raw.endswith("]")
        is_tuple = raw.startswith("(") and raw.endswith(")")
        if is_list or is_tuple:
            inner = raw[1:-1]
            return [
                AQLValueCodec.parse(item.strip())
                for item in AQLValueCodec.split_outside_quotes(inner, ",")
                if item.strip()
            ]

        lowered = raw.lower()
        if lowered in {"true", "false"}:
            return lowered == "true"
        if re.match(r"^-?\d+\.\d+$", raw):
            return float(raw)
        if re.match(r"^-?\d+$", raw):
            return int(raw)
        return raw

    @staticmethod
    def format_literal(value: Any, field_type: str, op: Optional[str] = None) -> str:
        if op == "in":
            if isinstance(value, (list, tuple)):
                items = value
            elif isinstance(value, str):
                raw = value.strip()
                if raw.startswith(("(", "[")):
                    return raw
                items = [part.strip() for part in raw.split(",") if part.strip()]
            else:
                items = [value]
            formatted = ", ".join(
                AQLValueCodec.format_literal(item, field_type) for item in items
            )
            return f"({formatted})"

        if isinstance(value, bool):
            return "true" if value else "false"
        if isinstance(value, (int, float)):
            return str(value)
        if isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                return '""'
            if stripped.lower().startswith("now()"):
                return stripped
            if field_type == "number":
                try:
                    number = float(stripped)
                    return str(int(number)) if number.is_integer() else str(number)
                except ValueError:
                    pass
            if stripped.lower() in {"true", "false"}:
                return stripped.lower()
            escaped = stripped.replace("\\", "\\\\").replace('"', '\\"')
            return f'"{escaped}"'
        return f'"{str(value)}"'

    @staticmethod
    def split_outside_quotes(value: str, separator: str) -> list[str]:
        parts: list[str] = []
        buffer: list[str] = []
        quote: Optional[str] = None
        index = 0

        while index < len(value):
            character = value[index]
            if character in {"'", '"'} and (index == 0 or value[index - 1] != "\\"):
                if quote == character:
                    quote = None
                elif quote is None:
                    quote = character

            if quote is None and value[index : index + len(separator)] == separator:
                parts.append("".join(buffer).strip())
                buffer = []
                index += len(separator)
                continue

            buffer.append(character)
            index += 1

        if buffer:
            parts.append("".join(buffer).strip())
        return parts

    @staticmethod
    def split_conjunction(value: str) -> list[str]:
        parts: list[str] = []
        buffer: list[str] = []
        quote: Optional[str] = None
        index = 0

        while index < len(value):
            character = value[index]
            if character in {"'", '"'} and (index == 0 or value[index - 1] != "\\"):
                if quote == character:
                    quote = None
                elif quote is None:
                    quote = character

            if quote is None and value[index : index + 3].lower() == "and":
                before = value[index - 1] if index > 0 else " "
                after = value[index + 3] if index + 3 < len(value) else " "
                if before.isspace() and after.isspace():
                    parts.append("".join(buffer).strip())
                    buffer = []
                    index += 3
                    continue

            buffer.append(character)
            index += 1

        if buffer:
            parts.append("".join(buffer).strip())
        return parts
