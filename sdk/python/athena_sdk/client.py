from __future__ import annotations

import json
import random
import time
from typing import Any, Optional, Iterator
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
        max_retries: int = 0,
        retry_backoff: float = 0.2,
        retry_max_delay: float = 2.0,
        retry_jitter: float = 0.1,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.project_id = project_id
        self.api_key = api_key
        self.timeout = timeout
        self.max_retries = max_retries
        self.retry_backoff = retry_backoff
        self.retry_max_delay = retry_max_delay
        self.retry_jitter = retry_jitter

    def chat_completion(
        self,
        request: dict[str, Any],
        trace_context: Optional[TraceContext] = None,
        bypass_cache: bool = False,
    ) -> dict[str, Any]:
        if request.get("stream"):
            raise AthenaClientError("Use stream_chat_completion for streaming requests.")
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
        for attempt in range(self.max_retries + 1):
            try:
                with urlopen(req, timeout=self.timeout) as response:
                    raw = response.read().decode("utf-8")
                    return json.loads(raw)
            except HTTPError as e:
                body = e.read().decode("utf-8") if e.fp else ""
                if self._should_retry_status(e.code) and attempt < self.max_retries:
                    self._sleep_backoff(attempt)
                    continue
                raise AthenaClientError(f"HTTP {e.code}: {body}") from e
            except URLError as e:
                if attempt < self.max_retries:
                    self._sleep_backoff(attempt)
                    continue
                raise AthenaClientError(f"Request failed: {e}") from e
        raise AthenaClientError("Request failed after retries")

    def stream_chat_completion(
        self,
        request: dict[str, Any],
        trace_context: Optional[TraceContext] = None,
        bypass_cache: bool = False,
    ) -> Iterator[dict[str, Any]]:
        resolved_request, context = self._apply_trace_context(request, trace_context)
        resolved_request["stream"] = True
        headers = {
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
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

        for attempt in range(self.max_retries + 1):
            yielded = False
            try:
                req = Request(url, data=payload, headers=headers, method="POST")
                with urlopen(req, timeout=self.timeout) as response:
                    for event in self._iter_sse(response):
                        yielded = True
                        yield event
                return
            except HTTPError as e:
                body = e.read().decode("utf-8") if e.fp else ""
                if yielded or not self._should_retry_status(e.code) or attempt >= self.max_retries:
                    raise AthenaClientError(f"HTTP {e.code}: {body}") from e
                self._sleep_backoff(attempt)
            except URLError as e:
                if yielded or attempt >= self.max_retries:
                    raise AthenaClientError(f"Request failed: {e}") from e
                self._sleep_backoff(attempt)
        raise AthenaClientError("Stream failed after retries")

    def _iter_sse(self, response) -> Iterator[dict[str, Any]]:
        for raw_line in response:
            line = raw_line.decode("utf-8").strip()
            if not line.startswith("data:"):
                continue
            data = line[5:].strip()
            if not data:
                continue
            if data == "[DONE]":
                return
            try:
                yield json.loads(data)
            except json.JSONDecodeError:
                yield {"raw": data}

    def _should_retry_status(self, status: int) -> bool:
        return status in {408, 429, 500, 502, 503, 504}

    def _sleep_backoff(self, attempt: int) -> None:
        delay = min(self.retry_backoff * (2 ** attempt), self.retry_max_delay)
        if self.retry_jitter > 0:
            jitter = random.uniform(-self.retry_jitter, self.retry_jitter)
            delay = max(0.0, delay + jitter)
        time.sleep(delay)

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
