from __future__ import annotations

from http.client import HTTPResponse
import json
from typing import Any, Iterator

from .errors import AthenaClientError


def iter_sse(
    response: HTTPResponse,
    *,
    require_done_marker: bool = False,
) -> Iterator[dict[str, Any]]:
    for raw_line in response:
        line = raw_line.decode("utf-8", errors="replace").strip()
        if not line.startswith("data:"):
            continue
        data = line[5:].strip()
        if not data:
            continue
        if data == "[DONE]":
            return
        try:
            event: object = json.loads(data)
            yield event if isinstance(event, dict) else {"raw": data}
        except json.JSONDecodeError:
            yield {"raw": data}
    if require_done_marker:
        raise AthenaClientError("Athena proxy stream ended before the completion marker.")


def decode_json_response(payload: bytes, source: str) -> dict[str, Any]:
    try:
        decoded: object = json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise AthenaClientError(f"{source} returned invalid JSON.") from error
    if not isinstance(decoded, dict):
        raise AthenaClientError(f"{source} returned a non-object response.")
    return decoded
