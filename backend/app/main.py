from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict
from contextlib import asynccontextmanager
from sqlmodel import select, Session

from .database import init_db, get_session
# Import both Pydantic schemas (Trace, Span) and DB Models (TraceModel, SpanModel, Project)
from .models import (
    Trace, Span, Project, TraceModel, SpanModel, 
    SpanMetrics, SpanAttributes
)

# --- Startup ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB (Sync, but okay in lifespan)
    init_db()
    yield

app = FastAPI(lifespan=lifespan)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Endpoints (Sync for Threadpool execution) ---

@app.get("/")
def read_root():
    return {"message": "Athena API is running with SQLite persistence (Sync)"}

@app.get("/projects", response_model=List[Project])
def get_projects(session: Session = Depends(get_session)):
    result = session.exec(select(Project))
    return result.all()

@app.get("/projects/{project_id}/traces", response_model=List[Trace])
def get_project_traces(project_id: str, session: Session = Depends(get_session)):
    # Explicitly load spans? SQLModel with sync session handles lazy loading if accessed
    # But usually better to join or eager load.
    # For now, let's rely on basic select.
    
    # statement = select(TraceModel).where(TraceModel.project_id == project_id).order_by(TraceModel.timestamp.desc())
    # result = session.exec(statement)
    # trace_models = result.all()
    # Issue: TraceModel.spans access will trigger lazy load. 
    # Since session is open, this should work.
    
    trace_models = session.exec(select(TraceModel).where(TraceModel.project_id == project_id).order_by(TraceModel.timestamp.desc())).all()

    # Convert DB Models -> API Response Models
    api_traces = []
    for tm in trace_models:
        # Reconstruct Root Span vs Children
        
        def to_span_pydantic(sm: SpanModel) -> Span:
            return Span(
                id=sm.id,
                trace_id=sm.trace_id,
                parent_id=sm.parent_id,
                name=sm.name,
                type=sm.type,
                start_time=sm.start_time,
                end_time=sm.end_time,
                status=sm.status,
                input=sm.input,
                output=sm.output,
                metrics=SpanMetrics(**sm.metrics),
                attributes=SpanAttributes(**sm.attributes),
                tags=sm.tags or [],
                error_message=sm.error_message
            )
        
        # Accessing tm.spans triggers query
        converted_spans = [to_span_pydantic(s) for s in tm.spans]
        root_span = next((s for s in converted_spans if not s.parent_id), None)
        
        if root_span:
            api_traces.append(Trace(
                id=tm.id,
                root_span=root_span,
                spans=converted_spans,
                project_id=tm.project_id,
                timestamp=tm.timestamp,
                total_latency=tm.total_latency,
                total_cost=tm.total_cost,
                total_tokens=tm.total_tokens,
                status=tm.status,
                tags=tm.tags or []
            ))
            
    return api_traces

@app.post("/traces", response_model=Dict[str, str])
def create_trace(trace: Trace, session: Session = Depends(get_session)):
    # 1. Upsert Project? (Assumed to exist)
    
    # 2. Create TraceModel
    trace_model = TraceModel(
        id=trace.id,
        project_id=trace.project_id,
        timestamp=trace.timestamp,
        total_latency=trace.total_latency,
        total_cost=trace.total_cost,
        total_tokens=trace.total_tokens,
        status=trace.status,
        tags=trace.tags
    )
    session.add(trace_model)
    
    # 3. Create SpanModels
    for span in trace.spans:
        span_model = SpanModel(
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
            error_message=span.error_message
        )
        session.add(span_model)
    
    session.commit()
    return {"status": "success", "trace_id": trace.id}
