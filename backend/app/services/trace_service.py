from __future__ import annotations

from typing import Optional, Tuple, List

from app.models import Trace, TraceModel, SpanModel


class TraceService:
    def __init__(self) -> None:
        pass

    def validate_trace(self, trace: Trace) -> Optional[str]:
        span_ids = {span.id for span in trace.spans}
        root_span_id = None
        for span in trace.spans:
            if span.parent_id:
                if span.parent_id not in span_ids:
                    raise ValueError(
                        f"Parent span '{span.parent_id}' not found in trace for span '{span.id}'"
                    )
            else:
                if root_span_id is None:
                    root_span_id = span.id
        return root_span_id

    def build_models(self, trace: Trace) -> Tuple[TraceModel, List[SpanModel], Optional[str]]:
        root_span_id = self.validate_trace(trace)
        trace_model = TraceModel(
            id=trace.id,
            project_id=trace.project_id,
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
