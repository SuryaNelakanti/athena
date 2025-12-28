from __future__ import annotations

import json
from typing import Any, Optional
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

from .context import TraceContext, get_current_trace_context, new_trace_context


class AthenaClientError(RuntimeError):
    pass


class AthenaClient:
    def __init__(
        self,
        base_url: str = "http://localhost:8000",
        project_id: str = "proj_default",
        api_key: Optional[str] = None,
        timeout: float = 30.0,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.project_id = project_id
        self.api_key = api_key
        self.timeout = timeout

    def chat_completion(
        self,
        request: dict[str, Any],
        trace_context: Optional[TraceContext] = None,
        bypass_cache: bool = False,
    ) -> dict[str, Any]:
        resolved_request, context = self._apply_trace_context(request, trace_context)
        headers = {
            "Content-Type": "application/json",
            "X-Athena-Project-ID": self.project_id,
            "X-Athena-Trace-ID": context.trace_id,
        }
        if context.parent_span_id:
            headers["X-Athena-Parent-Span-ID"] = context.parent_span_id
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        if bypass_cache:
            headers["X-Athena-Cache-Control"] = "no-cache"

        url = f"{self.base_url}/v1/chat/completions"
        payload = json.dumps(resolved_request).encode("utf-8")

        req = Request(url, data=payload, headers=headers, method="POST")
        try:
            with urlopen(req, timeout=self.timeout) as response:
                raw = response.read().decode("utf-8")
                return json.loads(raw)
        except HTTPError as e:
            body = e.read().decode("utf-8") if e.fp else ""
            raise AthenaClientError(f"HTTP {e.code}: {body}") from e
        except URLError as e:
            raise AthenaClientError(f"Request failed: {e}") from e

    def _apply_trace_context(
        self,
        request: dict[str, Any],
        trace_context: Optional[TraceContext],
    ) -> tuple[dict[str, Any], TraceContext]:
        request = dict(request)
        context = trace_context or get_current_trace_context()
        if context is None:
            context = new_trace_context(
                trace_id=request.get("trace_id"),
                trace_group_id=request.get("trace_group_id"),
            )

        trace_id = request.get("trace_id") or context.trace_id
        trace_group_id = request.get("trace_group_id") or context.trace_group_id
        parent_span_id = request.get("parent_span_id") or context.parent_span_id

        request["trace_id"] = trace_id
        request["trace_group_id"] = trace_group_id
        if parent_span_id:
            request["parent_span_id"] = parent_span_id

        if "project_id" not in request:
            request["project_id"] = self.project_id

        return request, TraceContext(
            trace_id=trace_id,
            trace_group_id=trace_group_id,
            parent_span_id=parent_span_id,
        )
