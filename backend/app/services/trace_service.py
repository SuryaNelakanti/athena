from __future__ import annotations

from typing import Optional, Tuple, List, Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.models import Trace, TraceModel, SpanModel


class TraceService:
    def __init__(self) -> None:
        pass

    def validate_trace(self, trace: Trace) -> Optional[str]:
        span_ids = {span.id for span in trace.spans}
        root_span_id = None
        root_count = 0
        for span in trace.spans:
            if span.parent_id:
                if span.parent_id not in span_ids:
                    raise ValueError(
                        f"Parent span '{span.parent_id}' not found in trace for span '{span.id}'"
                    )
            else:
                root_count += 1
                if root_span_id is None:
                    root_span_id = span.id
        if root_count == 0:
            raise ValueError("Trace must have exactly one root span (found 0)")
        if root_count > 1:
            raise ValueError(f"Trace must have exactly one root span (found {root_count})")
        return root_span_id

    def build_models(self, trace: Trace) -> Tuple[TraceModel, List[SpanModel], Optional[str]]:
        root_span_id = self.validate_trace(trace)
        trace_model = TraceModel(
            id=trace.id,
            project_id=trace.project_id,
            parent_trace_id=trace.parent_trace_id,
            trace_group_id=trace.trace_group_id or (trace.parent_trace_id or trace.id),
            input_span_id=trace.input_span_id,
            output_span_id=trace.output_span_id,
            timestamp=trace.timestamp,
            total_latency=trace.total_latency,
            total_cost=trace.total_cost,
            total_tokens=trace.total_tokens,
            status=trace.status,
            tags=trace.tags,
        )
        span_models: List[SpanModel] = []
        for span in trace.spans:
            span_models.append(
                SpanModel(
                    id=span.id,
                    trace_id=trace.id,
                    parent_id=span.parent_id,
                    name=span.name,
                    type=span.type,
                    start_time=span.start_time,
                    end_time=span.end_time,
                    status=span.status,
                    input=span.input,
                    output=span.output,
                    metrics=span.metrics.dict(),
                    attributes=span.attributes.dict(),
                    tags=span.tags,
                    error_message=span.error_message,
                )
            )
        return trace_model, span_models, root_span_id


async def extract_trace_io(
    session: AsyncSession,
    trace_id: str,
) -> tuple[dict, dict, Optional[str], Optional[str]]:
    """
    Extract input/output from a trace using canonical logic.

    Priority order:
    1. Use trace.input_span_id / trace.output_span_id if set and valid
    2. Fallback to root span for both input and output
    3. Final fallback: first span input, last span output (legacy)

    Returns:
        (input_data, output_data, input_span_id, output_span_id)
    """
    trace = await session.get(TraceModel, trace_id)
    if not trace:
        raise ValueError(f"Trace {trace_id} not found")

    stmt = select(SpanModel).where(SpanModel.trace_id == trace_id).order_by(SpanModel.start_time)
    result = await session.execute(stmt)
    spans = result.scalars().all()
    if not spans:
        raise ValueError("Trace has no spans")

    span_by_id: dict[str, SpanModel] = {span.id: span for span in spans}

    input_span_id = trace.input_span_id if trace.input_span_id in span_by_id else None
    output_span_id = trace.output_span_id if trace.output_span_id in span_by_id else None

    root_span = next((span for span in spans if span.parent_id is None), None)

    if not input_span_id:
        input_span_id = root_span.id if root_span else spans[0].id

    if not output_span_id:
        output_span_id = root_span.id if root_span else spans[-1].id

    input_span = span_by_id.get(input_span_id)
    output_span = span_by_id.get(output_span_id)

    input_data: Any = input_span.input if input_span and input_span.input is not None else {}
    output_data: Any = output_span.output if output_span and output_span.output is not None else {}

    return input_data, output_data, input_span_id, output_span_id
