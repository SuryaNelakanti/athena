from __future__ import annotations

from dataclasses import dataclass
import functools
import contextvars
import inspect
import uuid
from typing import Any, Callable, Optional, TypeVar, cast


_trace_id_var: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "athena_trace_id", default=None
)
_parent_span_id_var: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "athena_parent_span_id", default=None
)
_trace_group_id_var: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "athena_trace_group_id", default=None
)


@dataclass(frozen=True)
class TraceContext:
    trace_id: str
    trace_group_id: str
    parent_span_id: Optional[str] = None

    def with_parent_span(self, parent_span_id: Optional[str]) -> "TraceContext":
        return TraceContext(
            trace_id=self.trace_id,
            trace_group_id=self.trace_group_id,
            parent_span_id=parent_span_id,
        )


def new_trace_id() -> str:
    return f"trace_{uuid.uuid4().hex}"


def new_trace_context(
    trace_id: Optional[str] = None,
    trace_group_id: Optional[str] = None,
) -> TraceContext:
    resolved_trace_id = trace_id or new_trace_id()
    resolved_trace_group_id = trace_group_id or resolved_trace_id
    return TraceContext(
        trace_id=resolved_trace_id,
        trace_group_id=resolved_trace_group_id,
    )


def get_current_trace_context() -> Optional[TraceContext]:
    trace_id = _trace_id_var.get()
    trace_group_id = _trace_group_id_var.get()
    if not trace_id or not trace_group_id:
        return None
    return TraceContext(
        trace_id=trace_id,
        trace_group_id=trace_group_id,
        parent_span_id=_parent_span_id_var.get(),
    )


def set_current_trace_context(context: Optional[TraceContext]) -> None:
    if context is None:
        _trace_id_var.set(None)
        _trace_group_id_var.set(None)
        _parent_span_id_var.set(None)
        return
    _trace_id_var.set(context.trace_id)
    _trace_group_id_var.set(context.trace_group_id)
    _parent_span_id_var.set(context.parent_span_id)


F = TypeVar("F", bound=Callable[..., Any])


def observe(func: Optional[F] = None) -> F:
    """
    Decorator that ensures a trace context is available for the function call.
    If a context is already set, it is reused. Otherwise a new trace is created.
    """

    def decorator(fn: F) -> F:
        if inspect.iscoroutinefunction(fn):

            @functools.wraps(fn)
            async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
                existing = get_current_trace_context()
                context = existing or new_trace_context()
                token_trace = _trace_id_var.set(context.trace_id)
                token_group = _trace_group_id_var.set(context.trace_group_id)
                token_parent = _parent_span_id_var.set(context.parent_span_id)
                try:
                    return await fn(*args, **kwargs)
                finally:
                    _trace_id_var.reset(token_trace)
                    _trace_group_id_var.reset(token_group)
                    _parent_span_id_var.reset(token_parent)

            return cast(F, async_wrapper)

        @functools.wraps(fn)
        def sync_wrapper(*args: Any, **kwargs: Any) -> Any:
            existing = get_current_trace_context()
            context = existing or new_trace_context()
            token_trace = _trace_id_var.set(context.trace_id)
            token_group = _trace_group_id_var.set(context.trace_group_id)
            token_parent = _parent_span_id_var.set(context.parent_span_id)
            try:
                return fn(*args, **kwargs)
            finally:
                _trace_id_var.reset(token_trace)
                _trace_group_id_var.reset(token_group)
                _parent_span_id_var.reset(token_parent)

        return cast(F, sync_wrapper)

    if func is None:
        return cast(F, decorator)
    return decorator(func)


def context_from_response(
    response: dict,
    fallback: Optional[TraceContext] = None,
) -> TraceContext:
    trace_id = response.get("trace_id") or (fallback.trace_id if fallback else None)
    trace_group_id = response.get("trace_group_id") or (
        fallback.trace_group_id if fallback else None
    )
    parent_span_id = response.get("span_id")
    if not trace_id:
        trace_id = new_trace_id()
    if not trace_group_id:
        trace_group_id = trace_id
    return TraceContext(
        trace_id=trace_id,
        trace_group_id=trace_group_id,
        parent_span_id=parent_span_id,
    )
