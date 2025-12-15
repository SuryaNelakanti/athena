from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict
from contextlib import asynccontextmanager
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession

from .database import init_db, get_session
from .models import (
    Trace, Span, Project, TraceModel, SpanModel, 
    SpanMetrics, SpanAttributes, SpanType
)
from .routers import proxy as proxy_router

# --- Startup ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB (Async)
    await init_db()
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

# Include Routers
app.include_router(proxy_router.router)

# --- Endpoints (Async) ---

@app.get("/")
async def read_root():
    return {"message": "Athena API is running with SQLite persistence (Async)"}

@app.get("/projects", response_model=List[Project])
async def get_projects(session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(Project))
    return result.scalars().all()

from sqlalchemy import func

# ... (imports)
from .routers import views as views_router

# ... (inside lifespan or app definition)
app.include_router(views_router.router)

@app.get("/projects/{project_id}/traces", response_model=List[Trace])
async def get_project_traces(
    project_id: str,
    status: str = None,
    search: str = None,
    start_time: int = None,
    end_time: int = None,
    limit: int = 100,
    offset: int = 0,
    session: AsyncSession = Depends(get_session)
):
    # Async select
    query = select(TraceModel).where(TraceModel.project_id == project_id)
    
    if status and status != 'all':
        query = query.where(TraceModel.status == status)
        
    if start_time:
        query = query.where(TraceModel.timestamp >= start_time)
        
    if end_time:
        query = query.where(TraceModel.timestamp <= end_time)
        
    # Basic search on root span name (requires joining or denormalizing, but for now specific to Trace tags logic or ID?)
    # Ideally search should look into Spans. doing a simple ID/Status check for now, or joining.
    # To keep it simple for SQLite without full text search engine:
    if search:
        # Search in ID or tags (as JSON string roughly)
        # For effective name search we need to join with SpanModel (root span)
        # Let's do a basic ID search for now or join.
        # Joining root span
        query = query.join(SpanModel, TraceModel.id == SpanModel.trace_id).where(
            (SpanModel.parent_id == None) & 
            (SpanModel.name.contains(search) | TraceModel.id.contains(search))
        )

    query = query.order_by(TraceModel.timestamp.desc()).offset(offset).limit(limit)
    
    result = await session.execute(query)
    trace_models = result.scalars().all()
    
    # ... (rest of the conversion logic)
    
    api_traces = []
    for tm in trace_models:
        # Fetch spans for this trace
        # Optimization: Could fetch all spans for all trace_ids in one query if list is small
        spans_statement = select(SpanModel).where(SpanModel.trace_id == tm.id)
        spans_result = await session.execute(spans_statement)
        spans = spans_result.scalars().all()
        
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

        converted_spans = [to_span_pydantic(s) for s in spans]
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
async def create_trace(trace: Trace, session: AsyncSession = Depends(get_session)):
    # 1. Upsert Project? (Assumed to exist for now, or ignore)
    
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
    
    await session.commit()
    return {"status": "success", "trace_id": trace.id}
