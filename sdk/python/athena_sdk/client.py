from __future__ import annotations

from http.client import HTTPResponse
import json
import math
import random
import time
from typing import Any, Iterator, Literal, Optional
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from .context import TraceContext, get_current_trace_context, new_trace_context
from .errors import AthenaClientError
from .response_decoding import decode_json_response, iter_sse

_RETRYABLE_HTTP_STATUSES = frozenset({408, 429, 500, 502, 503, 504})


def _validate_retry_count(value: int) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError("max_retries must be a non-negative integer.")
    return value


def _validate_duration(name: str, value: float, allow_zero: bool = True) -> float:
    if not math.isfinite(value) or value < 0 or (not allow_zero and value == 0):
        minimum = "non-negative" if allow_zero else "greater than zero"
        raise ValueError(f"{name} must be a finite number {minimum}.")
    return value


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
        fail_open: bool = False,
        fallback_base_url: Optional[str] = None,
        fallback_api_key: Optional[str] = None,
        fallback_headers: Optional[dict[str, str]] = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.project_id = project_id
        self.api_key = api_key
        self.timeout = _validate_duration("timeout", timeout, allow_zero=False)
        self.max_retries = _validate_retry_count(max_retries)
        self.retry_backoff = _validate_duration("retry_backoff", retry_backoff)
        self.retry_max_delay = _validate_duration("retry_max_delay", retry_max_delay)
        self.retry_jitter = _validate_duration("retry_jitter", retry_jitter)
        self.fail_open = fail_open
        self.fallback_base_url = (fallback_base_url or "https://api.openai.com/v1").rstrip("/")
        self.fallback_api_key = fallback_api_key
        self.fallback_headers = fallback_headers or {}

    def chat_completion(
        self,
        request: dict[str, Any],
        trace_context: Optional[TraceContext] = None,
        bypass_cache: bool = False,
        cache_key: Optional[str] = None,
    ) -> dict[str, Any]:
        if request.get("stream"):
            raise AthenaClientError("Use stream_chat_completion for streaming requests.")
        resolved_request, context = self._apply_trace_context(request, trace_context)
        headers = self._request_headers(context, bypass_cache, cache_key)

        url = f"{self.base_url}/v1/chat/completions"
        payload = json.dumps(resolved_request).encode("utf-8")

        try:
            with self._open_with_retry(url, payload, headers) as response:
                response_payload = response.read()
        except HTTPError as error:
            body = error.read().decode("utf-8", errors="replace") if error.fp else ""
            if self._should_fail_open(error.code):
                return self._fail_open_request(resolved_request)
            raise AthenaClientError(f"HTTP {error.code}: {body}", status=error.code) from error
        except (URLError, TimeoutError) as error:
            if self._should_fail_open(None):
                return self._fail_open_request(resolved_request)
            raise AthenaClientError(f"Request failed: {error}") from error

        try:
            return self._decode_json_response(response_payload, "Athena proxy")
        except AthenaClientError:
            if self._should_fail_open(None):
                return self._fail_open_request(resolved_request)
            raise

    def stream_chat_completion(
        self,
        request: dict[str, Any],
        trace_context: Optional[TraceContext] = None,
        bypass_cache: bool = False,
        cache_key: Optional[str] = None,
    ) -> Iterator[dict[str, Any]]:
        resolved_request, context = self._apply_trace_context(request, trace_context)
        resolved_request["stream"] = True
        headers = self._request_headers(context, bypass_cache, cache_key, stream=True)

        url = f"{self.base_url}/v1/chat/completions"
        payload = json.dumps(resolved_request).encode("utf-8")
        yield from self._stream_with_retry(
            url,
            payload,
            headers,
            source="Athena proxy",
            fallback_request=resolved_request,
        )

    def _request_headers(
        self,
        context: TraceContext,
        bypass_cache: bool,
        cache_key: Optional[str],
        stream: bool = False,
    ) -> dict[str, str]:
        headers = {
            "Content-Type": "application/json",
            "X-Athena-Project-ID": self.project_id,
            "X-Athena-Trace-ID": context.trace_id,
        }
        if stream:
            headers["Accept"] = "text/event-stream"
        if context.parent_span_id:
            headers["X-Athena-Parent-Span-ID"] = context.parent_span_id
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        if bypass_cache:
            headers["X-Athena-Cache-Control"] = "no-cache"
        if cache_key:
            headers["X-Athena-Cache-Key"] = cache_key
        return headers

    def _iter_sse(
        self,
        response: HTTPResponse,
        *,
        require_done_marker: bool = False,
    ) -> Iterator[dict[str, Any]]:
        yield from iter_sse(response, require_done_marker=require_done_marker)

    def _decode_json_response(self, payload: bytes, source: str) -> dict[str, Any]:
        return decode_json_response(payload, source)

    def _open_with_retry(self, url: str, payload: bytes, headers: dict[str, str]) -> HTTPResponse:
        for attempt in range(self.max_retries + 1):
            request = Request(url, data=payload, headers=headers, method="POST")
            try:
                return urlopen(request, timeout=self.timeout)
            except HTTPError as error:
                if self._should_retry_status(error.code) and attempt < self.max_retries:
                    error.close()
                    self._sleep_backoff(attempt)
                    continue
                raise
            except (URLError, TimeoutError):
                if attempt >= self.max_retries:
                    raise
                self._sleep_backoff(attempt)
        raise AthenaClientError("Request failed after retries")

    def _stream_with_retry(
        self,
        url: str,
        payload: bytes,
        headers: dict[str, str],
        source: Literal["Athena proxy", "Fail-open provider"],
        fallback_request: Optional[dict[str, Any]] = None,
    ) -> Iterator[dict[str, Any]]:
        for attempt in range(self.max_retries + 1):
            yielded = False
            request = Request(url, data=payload, headers=headers, method="POST")
            try:
                with urlopen(request, timeout=self.timeout) as response:
                    for event in self._iter_sse(
                        response,
                        require_done_marker=source == "Athena proxy",
                    ):
                        yielded = True
                        yield event
                return
            except AthenaClientError:
                if not yielded and attempt < self.max_retries:
                    self._sleep_backoff(attempt)
                    continue
                if (
                    not yielded
                    and fallback_request is not None
                    and self._should_fail_open(None)
                ):
                    yield from self._fail_open_stream(fallback_request)
                    return
                raise
            except HTTPError as error:
                body = error.read().decode("utf-8", errors="replace") if error.fp else ""
                if (
                    not yielded
                    and self._should_retry_status(error.code)
                    and attempt < self.max_retries
                ):
                    self._sleep_backoff(attempt)
                    continue
                if (
                    not yielded
                    and fallback_request is not None
                    and self._should_fail_open(error.code)
                ):
                    yield from self._fail_open_stream(fallback_request)
                    return
                prefix = "Fail-open " if source == "Fail-open provider" else ""
                message = f"{prefix}HTTP {error.code}: {body}"
                raise AthenaClientError(message, status=error.code) from error
            except (URLError, TimeoutError) as error:
                if yielded or attempt >= self.max_retries:
                    if (
                        not yielded
                        and fallback_request is not None
                        and self._should_fail_open(None)
                    ):
                        yield from self._fail_open_stream(fallback_request)
                        return
                    prefix = (
                        "Fail-open stream failed"
                        if source == "Fail-open provider"
                        else "Request failed"
                    )
                    raise AthenaClientError(f"{prefix}: {error}") from error
                self._sleep_backoff(attempt)
        prefix = "Fail-open stream failed" if source == "Fail-open provider" else "Stream failed"
        raise AthenaClientError(f"{prefix} after retries")

    def _should_retry_status(self, status: int) -> bool:
        return status in _RETRYABLE_HTTP_STATUSES

    def _sleep_backoff(self, attempt: int) -> None:
        delay = min(self.retry_backoff * (2 ** attempt), self.retry_max_delay)
        if self.retry_jitter > 0:
            jitter = random.uniform(-self.retry_jitter, self.retry_jitter)
            delay = max(0.0, delay + jitter)
        time.sleep(delay)

    def _should_fail_open(self, status: Optional[int]) -> bool:
        if not self.fail_open:
            return False
        if status is None:
            return True
        return status in _RETRYABLE_HTTP_STATUSES

    def _fallback_request_headers(self, stream: bool = False) -> dict[str, str]:
        headers: dict[str, str] = {
            "Content-Type": "application/json",
            **self.fallback_headers,
        }
        if stream:
            headers.setdefault("Accept", "text/event-stream")
        if "Authorization" not in headers:
            if not self.fallback_api_key:
                raise AthenaClientError("Fail-open enabled but fallback_api_key is not set.")
            headers["Authorization"] = f"Bearer {self.fallback_api_key}"
        return headers

    def _sanitize_fallback_request(self, request: dict[str, Any], stream: bool) -> dict[str, Any]:
        sanitized = dict(request)
        for key in ("trace_id", "trace_group_id", "parent_span_id", "project_id", "provider"):
            sanitized.pop(key, None)
        sanitized["stream"] = stream
        return sanitized

    def _fail_open_request(self, request: dict[str, Any]) -> dict[str, Any]:
        url = f"{self.fallback_base_url}/chat/completions"
        headers = self._fallback_request_headers()
        payload = json.dumps(self._sanitize_fallback_request(request, stream=False)).encode("utf-8")
        try:
            with self._open_with_retry(url, payload, headers) as response:
                return self._decode_json_response(response.read(), "Fail-open provider")
        except HTTPError as error:
            body = error.read().decode("utf-8", errors="replace") if error.fp else ""
            message = f"Fail-open HTTP {error.code}: {body}"
            raise AthenaClientError(message, status=error.code) from error
        except (URLError, TimeoutError) as error:
            raise AthenaClientError(f"Fail-open request failed: {error}") from error

    def _fail_open_stream(self, request: dict[str, Any]) -> Iterator[dict[str, Any]]:
        url = f"{self.fallback_base_url}/chat/completions"
        headers = self._fallback_request_headers(stream=True)
        payload = json.dumps(self._sanitize_fallback_request(request, stream=True)).encode("utf-8")
        yield from self._stream_with_retry(url, payload, headers, source="Fail-open provider")

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
