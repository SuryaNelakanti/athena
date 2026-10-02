from dataclasses import dataclass
from typing import Optional

from app.models import SpanModel, TraceModel


@dataclass
class ProxyCallContext:
    trace_id: str
    span_id: str
    log_id: str
    start_time: int
    existing_trace: Optional[TraceModel]
    trace: TraceModel
    span: SpanModel
