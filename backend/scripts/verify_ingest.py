import requests
import time
import uuid
import json

import os

BASE_URL = os.getenv("API_URL", "http://localhost:8000")

def generate_id():
    return uuid.uuid4().hex[:9]

def test_ingest():
    print("Testing Ingestion...")
    project_id = "proj_alpha"
    trace_id = generate_id()
    root_span_id = generate_id()
    child_span_id = generate_id()
    
    trace_payload = {
        "id": trace_id,
        "project_id": project_id,
        "timestamp": int(time.time() * 1000),
        "total_latency": 1500.5,
        "total_cost": 0.005,
        "total_tokens": 300,
        "status": "success",
        "tags": ["test-ingest"],
        "root_span": {
            "id": root_span_id,
            "trace_id": trace_id,
            "name": "Test Root Span",
            "type": "chain",
            "start_time": int(time.time() * 1000),
            "end_time": int(time.time() * 1000) + 1500,
            "status": "success",
            "input": {"query": "test"},
            "output": {"result": "ok"},
            "metrics": {
                "latency_ms": 1500.5
            },
            "attributes": {},
            "tags": []
        },
        "spans": [
            {
                # Root Span
                "id": root_span_id,
                "trace_id": trace_id,
                "name": "Test Root Span",
                "type": "chain",
                "start_time": int(time.time() * 1000),
                "end_time": int(time.time() * 1000) + 1500,
                "status": "success",
                "input": {"query": "test"},
                "output": {"result": "ok"},
                "metrics": {"latency_ms": 1500.5},
                "attributes": {},
                "tags": []
            },
            {
                # Child Span
                "id": child_span_id,
                "trace_id": trace_id,
                "parent_id": root_span_id,
                "name": "Test Child LLM",
                "type": "llm",
                "start_time": int(time.time() * 1000) + 100,
                "end_time": int(time.time() * 1000) + 500,
                "status": "success",
                "input": {"messages": [{"role": "user", "content": "hi"}]},
                "output": {"choices": "hello"},
                "metrics": {"latency_ms": 400.0, "total_tokens": 50},
                "attributes": {"model": "gpt-4"},
                "tags": []
            }
        ]
    }
    
    # 1. POST /traces
    print(f"Posting Trace {trace_id}...")
    try:
        resp = requests.post(f"{BASE_URL}/traces", json=trace_payload, timeout=5)
        resp.raise_for_status()
        print("Ingest Success:", resp.json())
    except Exception as e:
        print(f"Ingest Failed: {e}")
        if hasattr(e, 'response') and e.response:
             print(e.response.text)
        return

    # 2. GET /projects/{id}/traces
    print("Fetching Traces...")
    try:
        resp = requests.get(f"{BASE_URL}/projects/{project_id}/traces", timeout=5)
        traces = resp.json()
        
        found = next((t for t in traces if t['id'] == trace_id), None)
        if found:
            print("Verification Success! Trace found in DB.")
            print(f"Trace ID: {found['id']}, Spans: {len(found['spans'])}")
        else:
            print("Verification Failed! Trace not found in DB.")
    except Exception as e:
        print(f"Fetch Failed: {e}")

if __name__ == "__main__":
    time.sleep(2) # Wait for server
    test_ingest()
