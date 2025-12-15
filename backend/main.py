from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict
import uuid
import random
import time
from models import Project, Trace, Span, SpanType, SpanMetrics, SpanAttributes

app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- In-Memory Data Store (Mimicking Mock Data Generation) ---

MOCK_PROJECTS = [
    Project(id='proj_alpha', name='Athena Copilot', org_id='org_1'),
    Project(id='proj_beta', name='Support Bot V2', org_id='org_1'),
]

MOCK_INPUTS = [
    {'role': 'user', 'content': 'Explain quantum entanglement to a 5 year old.'},
    {'role': 'user', 'content': 'Debug this python code: def foo(): return 1/0'},
    {'role': 'system', 'content': 'You are a helpful assistant.'},
    {'role': 'user', 'content': 'Write a haiku about databases.'},
]

MOCK_OUTPUTS = [
    {'role': 'assistant', 'content': 'Spooky action there,\nParticles dance far apart,\nUniverse connects.'},
    {'role': 'assistant', 'content': 'It seems you are dividing by zero. That raises a ZeroDivisionError.'},
    {'role': 'assistant', 'content': 'Quantum entanglement is like having two magic dice...'},
]

def generate_id() -> str:
    return uuid.uuid4().hex[:9]

def create_mock_span(trace_id: str, parent_id: str | None, name: str, span_type: SpanType, start_offset: int, duration: int, error: bool = False) -> Span:
    is_llm = span_type == SpanType.LLM
    input_data = {'messages': [random.choice(MOCK_INPUTS)]} if is_llm else {'query': "SELECT * FROM users"}
    output_data = {'choices': [{'message': random.choice(MOCK_OUTPUTS)}]} if is_llm else {'result': "success"}
    
    if error:
        output_data = {'error': "Connection timeout"}

    attributes = SpanAttributes()
    if is_llm:
        attributes.model = 'gpt-4o' if random.random() > 0.5 else 'claude-3-5-sonnet'
        attributes.provider = 'openai' if random.random() > 0.5 else 'anthropic'
        attributes.temperature = 0.7
        attributes.reasoning_enabled = random.random() > 0.8
        attributes.reasoning_effort = 'medium'

    return Span(
        id=generate_id(),
        trace_id=trace_id,
        parent_id=parent_id,
        name=name,
        type=span_type,
        start_time=int(time.time() * 1000) - 1000000 + start_offset,
        end_time=int(time.time() * 1000) - 1000000 + start_offset + duration,
        status='error' if error else 'success',
        input=input_data,
        output=output_data,
        metrics=SpanMetrics(
            latency_ms=float(duration),
            prompt_tokens=50 if is_llm else 0,
            completion_tokens=150 if is_llm else 0,
            total_tokens=200 if is_llm else 0,
            cost=0.002 if is_llm else 0.0,
        ),
        attributes=attributes,
        tags=['prod', 'v1.2'] if random.random() > 0.7 else ['prod'],
        error_message="Connection timeout" if error else None
    )

def generate_mock_traces(count: int, project_id: str) -> List[Trace]:
    traces = []
    for _ in range(count):
        trace_id = generate_id()
        has_error = random.random() > 0.9
        
        # Root Span
        root_duration = int(2000 + random.random() * 3000)
        root_span = create_mock_span(trace_id, None, 'Chat Request', SpanType.CHAIN, 0, root_duration, has_error)
        
        spans = [root_span]
        
        # Child Spans
        child1_duration = 500
        spans.append(create_mock_span(trace_id, root_span.id, 'Retrieve Context', SpanType.RETRIEVER, 100, child1_duration))
        
        child2_start = 650
        child2_duration = int(1000 + random.random() * 1000)
        spans.append(create_mock_span(trace_id, root_span.id, 'LLM Generation', SpanType.LLM, child2_start, child2_duration))

        # Optional Reasoning Span
        if random.random() > 0.8:
             spans.append(create_mock_span(trace_id, root_span.id, 'Reasoning Step', SpanType.LLM, 700, 800))

        total_cost = sum(s.metrics.cost or 0 for s in spans)
        total_tokens = sum(s.metrics.total_tokens or 0 for s in spans)

        traces.append(Trace(
            id=trace_id,
            root_span=root_span,
            spans=spans,
            project_id=project_id,
            timestamp=root_span.start_time,
            total_latency=root_span.metrics.latency_ms,
            total_cost=total_cost,
            total_tokens=total_tokens,
            status=root_span.status,
            tags=root_span.tags
        ))
    
    return sorted(traces, key=lambda t: t.timestamp, reverse=True)

# Generate static set for session
SESSION_TRACES: Dict[str, List[Trace]] = {}
for p in MOCK_PROJECTS:
    SESSION_TRACES[p.id] = generate_mock_traces(50, p.id)

# --- Endpoints ---

@app.get("/")
def read_root():
    return {"message": "Athena API is running"}

@app.get("/projects", response_model=List[Project])
def get_projects():
    return MOCK_PROJECTS

@app.get("/projects/{project_id}/traces", response_model=List[Trace])
def get_project_traces(project_id: str):
    if project_id not in SESSION_TRACES:
         # Just generate on fly if not pre-generated to be nice
         SESSION_TRACES[project_id] = generate_mock_traces(10, project_id)
    return SESSION_TRACES[project_id]
