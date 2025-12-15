import httpx
import asyncio
import uuid
import time
import random
from datetime import datetime, timedelta

BASE_URL = "http://localhost:8000"
PROJECT_ID = "default_project"

def new_id():
    return str(uuid.uuid4())

def current_ms():
    return int(time.time() * 1000)

async def get_or_create_project():
    async with httpx.AsyncClient() as client:
        # 1. Try to get existing projects
        try:
            resp = await client.get(f"{BASE_URL}/projects")
            if resp.status_code == 200:
                projects = resp.json()
                if projects:
                    print(f"Using existing project: {projects[0]['id']}")
                    return projects[0]['id']
        except Exception:
            pass
        
        # 2. If no project, we might need to create one (if endpoint exists) or just use default.
        # But wait, we need a valid foreign key.
        # Let's assume 'default_project' or 'proj_alpha' exists from init_db?
        # If SQLite enforces foreign keys, we must insert project first.
        # But seemingly current app doesn't have create-project endpoint exposed in main.py? 
        # Let's check main.py... it serves /projects.
        # Let's just use 'proj_alpha' as fallback since we saw it in test_filters.
        return "proj_alpha"

async def seed_data():
    project_id = await get_or_create_project()
    print(f"🌱 Seeding 15 varied sample traces into '{project_id}'...")
    
    traces = []
    
    # Helpers
    now = current_ms()
    def t(min_ago): return now - (min_ago * 60 * 1000)

    # 1. Quantum Physics (Chat)
    t1_id = new_id()
    traces.append({
        "id": t1_id, "project_id": project_id, "timestamp": t(5), "total_latency": 450, "total_cost": 0.002, "total_tokens": 150, "status": "success", "tags": ["chat", "science"],
        "spans": [{
            "id": new_id(), "trace_id": t1_id, "name": "Chat: Quantum Entanglement", "type": "llm", "start_time": t(5), "end_time": t(5)+450, "status": "success",
            "input": {"messages": [{"role": "user", "content": "Explain quantum entanglement simply."}]},
            "output": {"choices": [{"message": {"content": "Quantum entanglement is when two particles become linked..."}}]},
            "metrics": {"total_tokens": 150, "latency_ms": 450, "cost": 0.002},
            "attributes": {"model": "gpt-4o", "provider": "openai"}, "tags": []
        }]
    })

    # 2. RAG Policy (Chain)
    t2_id = new_id(); r2_id = new_id()
    traces.append({
        "id": t2_id, "project_id": project_id, "timestamp": t(15), "total_latency": 1200, "total_cost": 0.005, "total_tokens": 500, "status": "success", "tags": ["rag", "policy"],
        "spans": [
            {"id": r2_id, "trace_id": t2_id, "name": "RAG: Reimbursement Policy", "type": "chain", "start_time": t(15), "end_time": t(15)+1200, "status": "success", "input": {"query": "Reimbursement limit?"}, "output": {"answer": "$50 limit"}, "metrics": {"latency_ms": 1200}, "attributes": {}, "tags": []},
            {"id": new_id(), "trace_id": t2_id, "parent_id": r2_id, "name": "Vector Search", "type": "retriever", "start_time": t(15)+50, "end_time": t(15)+350, "status": "success", "input": {"k": 3}, "output": {"docs": ["doc1"]}, "metrics": {"latency_ms": 300}, "attributes": {}, "tags": []},
            {"id": new_id(), "trace_id": t2_id, "parent_id": r2_id, "name": "Generate Answer", "type": "llm", "start_time": t(15)+360, "end_time": t(15)+1200, "status": "success", "input": {}, "output": {}, "metrics": {"latency_ms": 840, "cost": 0.005}, "attributes": {"model": "gpt-4-turbo"}, "tags": []}
        ]
    })

    # 3. Stock Timeout (Error)
    t3_id = new_id(); r3_id = new_id()
    traces.append({
        "id": t3_id, "project_id": project_id, "timestamp": t(0.5), "total_latency": 2100, "total_cost": 0.001, "total_tokens": 80, "status": "error", "tags": ["tool", "finance", "error"],
        "spans": [
            {"id": r3_id, "trace_id": t3_id, "name": "Stock Lookup: AAPL", "type": "chain", "start_time": t(0.5), "end_time": t(0.5)+2100, "status": "error", "input": {"symbol": "AAPL"}, "output": None, "metrics": {"latency_ms": 2100}, "attributes": {}, "tags": [], "error_message": "Timeout"},
            {"id": new_id(), "trace_id": t3_id, "parent_id": r3_id, "name": "Yahoo Finance API", "type": "tool", "start_time": t(0.5)+100, "end_time": t(0.5)+2100, "status": "error", "input": {"timeout": 2000}, "output": None, "metrics": {"latency_ms": 2000}, "attributes": {"tool": "yahoo"}, "tags": [], "error_message": "Connection timeout"}
        ]
    })

    # 4. O1 Math (Reasoning)
    t4_id = new_id()
    traces.append({
        "id": t4_id, "project_id": project_id, "timestamp": t(120), "total_latency": 8500, "total_cost": 0.045, "total_tokens": 1200, "status": "success", "tags": ["math", "reasoning"],
        "spans": [{
            "id": new_id(), "trace_id": t4_id, "name": "Math: Complex Integral", "type": "llm", "start_time": t(120), "end_time": t(120)+8500, "status": "success",
            "input": {"prompt": "Integral e^(-x^2)"}, "output": {"content": "sqrt(pi)"},
            "metrics": {"latency_ms": 8500, "cost": 0.045, "total_tokens": 1200},
            "attributes": {"model": "o1-preview", "reasoning_enabled": True}, "tags": []
        }]
    })

    # 5. Code: Bubblesort (Python)
    t5_id = new_id()
    traces.append({
        "id": t5_id, "project_id": project_id, "timestamp": t(30), "total_latency": 1500, "total_cost": 0.01, "total_tokens": 300, "status": "success", "tags": ["coding", "python"],
        "spans": [{
            "id": new_id(), "trace_id": t5_id, "name": "Code: Bubblesort", "type": "llm", "start_time": t(30), "end_time": t(30)+1500, "status": "success",
            "input": {"prompt": "Write bubblesort in Python"}, "output": {"content": "def bubble_sort(arr):..."},
            "metrics": {"latency_ms": 1500, "cost": 0.01, "total_tokens": 300},
            "attributes": {"model": "claude-3-opus", "provider": "anthropic"}, "tags": []
        }]
    })

    # 6. Code: React Component
    t6_id = new_id()
    traces.append({
        "id": t6_id, "project_id": project_id, "timestamp": t(60), "total_latency": 2200, "total_cost": 0.015, "total_tokens": 450, "status": "success", "tags": ["coding", "react"],
        "spans": [{
            "id": new_id(), "trace_id": t6_id, "name": "Code: React Button", "type": "llm", "start_time": t(60), "end_time": t(60)+2200, "status": "success",
            "input": {"prompt": "Create a button component"}, "output": {"content": "const Button = ..."},
            "metrics": {"latency_ms": 2200, "cost": 0.015, "total_tokens": 450},
            "attributes": {"model": "claude-3-5-sonnet", "provider": "anthropic"}, "tags": []
        }]
    })

    # 7. Translation: Spanish
    t7_id = new_id()
    traces.append({
        "id": t7_id, "project_id": project_id, "timestamp": t(10), "total_latency": 300, "total_cost": 0.001, "total_tokens": 50, "status": "success", "tags": ["translation"],
        "spans": [{
            "id": new_id(), "trace_id": t7_id, "name": "Translate: ES", "type": "llm", "start_time": t(10), "end_time": t(10)+300, "status": "success",
            "input": {"text": "Hello world", "target": "es"}, "output": {"text": "Hola Mundo"},
            "metrics": {"latency_ms": 300, "cost": 0.001, "total_tokens": 50},
            "attributes": {"model": "gpt-3.5-turbo"}, "tags": []
        }]
    })

    # 8. Translation: French
    t8_id = new_id()
    traces.append({
        "id": t8_id, "project_id": project_id, "timestamp": t(12), "total_latency": 320, "total_cost": 0.001, "total_tokens": 55, "status": "success", "tags": ["translation"],
        "spans": [{
            "id": new_id(), "trace_id": t8_id, "name": "Translate: FR", "type": "llm", "start_time": t(12), "end_time": t(12)+320, "status": "success",
            "input": {"text": "Good morning", "target": "fr"}, "output": {"text": "Bonjour"},
            "metrics": {"latency_ms": 320, "cost": 0.001, "total_tokens": 55},
            "attributes": {"model": "gpt-3.5-turbo"}, "tags": []
        }]
    })

    # 9. Extraction: Names (Gemini)
    t9_id = new_id()
    traces.append({
        "id": t9_id, "project_id": project_id, "timestamp": t(45), "total_latency": 600, "total_cost": 0.0005, "total_tokens": 200, "status": "success", "tags": ["extraction"],
        "spans": [{
            "id": new_id(), "trace_id": t9_id, "name": "Extract Names", "type": "llm", "start_time": t(45), "end_time": t(45)+600, "status": "success",
            "input": {"text": "John and Mary went to the park."}, "output": {"names": ["John", "Mary"]},
            "metrics": {"latency_ms": 600, "cost": 0.0005, "total_tokens": 200},
            "attributes": {"model": "gemini-pro", "provider": "google"}, "tags": []
        }]
    })

    # 10. Summarization: Meeting Notes
    t10_id = new_id()
    traces.append({
        "id": t10_id, "project_id": project_id, "timestamp": t(120), "total_latency": 2500, "total_cost": 0.01, "total_tokens": 1500, "status": "success", "tags": ["summarization"],
        "spans": [{
            "id": new_id(), "trace_id": t10_id, "name": "Summarize Meeting", "type": "llm", "start_time": t(120), "end_time": t(120)+2500, "status": "success",
            "input": {"transcript_len": 5000}, "output": {"summary": "Action items: ..."},
            "metrics": {"latency_ms": 2500, "cost": 0.01, "total_tokens": 1500},
            "attributes": {"model": "gpt-4o"}, "tags": []
        }]
    })

    # 11. Creative: Haiku
    t11_id = new_id()
    traces.append({
        "id": t11_id, "project_id": project_id, "timestamp": t(200), "total_latency": 400, "total_cost": 0.001, "total_tokens": 40, "status": "success", "tags": ["creative"],
        "spans": [{
            "id": new_id(), "trace_id": t11_id, "name": "Write Haiku", "type": "llm", "start_time": t(200), "end_time": t(200)+400, "status": "success",
            "input": {"topic": "AI"}, "output": {"haiku": "Silicon mind wakes\nThinking thoughts of electric\nFuture is now here"},
            "metrics": {"latency_ms": 400, "cost": 0.001, "total_tokens": 40},
            "attributes": {"temperature": 0.9, "model": "gpt-4o"}, "tags": []
        }]
    })

    # 12. Tool: Weather (Success)
    t12_id = new_id(); r12_id = new_id()
    traces.append({
        "id": t12_id, "project_id": project_id, "timestamp": t(2), "total_latency": 800, "total_cost": 0.002, "total_tokens": 120, "status": "success", "tags": ["tool", "weather"],
        "spans": [
            {"id": r12_id, "trace_id": t12_id, "name": "Check Weather", "type": "chain", "start_time": t(2), "end_time": t(2)+800, "status": "success", "input": {"city": "Tokyo"}, "output": {"temp": "22C"}, "metrics": {"latency_ms": 800}, "attributes": {}, "tags": []},
            {"id": new_id(), "trace_id": t12_id, "parent_id": r12_id, "name": "Weather API", "type": "tool", "start_time": t(2)+100, "end_time": t(2)+700, "status": "success", "input": {"lat": 35.6, "lon": 139.6}, "output": {"data": "Clear sky"}, "metrics": {"latency_ms": 600}, "attributes": {"tool": "openweather"}, "tags": []}
        ]
    })

    # 13. RAG: Legal Contract (Complex)
    t13_id = new_id(); r13_id = new_id()
    traces.append({
        "id": t13_id, "project_id": project_id, "timestamp": t(180), "total_latency": 3500, "total_cost": 0.02, "total_tokens": 2000, "status": "success", "tags": ["rag", "legal"],
        "spans": [
            {"id": r13_id, "trace_id": t13_id, "name": "RAG: Contract Analysis", "type": "chain", "start_time": t(180), "end_time": t(180)+3500, "status": "success", "input": {"query": "Liability clause?"}, "output": {"analysis": "Clause 5.2 states..."}, "metrics": {"latency_ms": 3500, "total_tokens": 2000}, "attributes": {}, "tags": []},
            {"id": new_id(), "trace_id": t13_id, "parent_id": r13_id, "name": "Hybrid Search", "type": "retriever", "start_time": t(180)+100, "end_time": t(180)+600, "status": "success", "input": {"modes": ["dense", "keyword"]}, "output": {"matches": 5}, "metrics": {"latency_ms": 500}, "attributes": {}, "tags": []},
            {"id": new_id(), "trace_id": t13_id, "parent_id": r13_id, "name": "Legal Specialist", "type": "llm", "start_time": t(180)+650, "end_time": t(180)+3500, "status": "success", "input": {}, "output": {}, "metrics": {"latency_ms": 2850, "cost": 0.02}, "attributes": {"model": "claude-3-opus"}, "tags": []}
        ]
    })
    
    # 14. SQL Generation (Security Check)
    t14_id = new_id()
    traces.append({
        "id": t14_id, "project_id": project_id, "timestamp": t(25), "total_latency": 500, "total_cost": 0.002, "total_tokens": 100, "status": "success", "tags": ["coding", "sql", "security"],
        "spans": [{
            "id": new_id(), "trace_id": t14_id, "name": "Generate SQL", "type": "llm", "start_time": t(25), "end_time": t(25)+500, "status": "success",
            "input": {"prompt": "Select users where id = 5"}, "output": {"sql": "SELECT * FROM users WHERE id = :id"},
            "metrics": {"latency_ms": 500, "cost": 0.002},
            "attributes": {"model": "gpt-4", "safe_mode": True}, "tags": []
        }]
    })

    # 15. Multimodal Image Analysis
    t15_id = new_id()
    traces.append({
        "id": t15_id, "project_id": project_id, "timestamp": t(55), "total_latency": 4500, "total_cost": 0.012, "total_tokens": 800, "status": "success", "tags": ["vision", "multimodal"],
        "spans": [{
            "id": new_id(), "trace_id": t15_id, "name": "Describe Image", "type": "llm", "start_time": t(55), "end_time": t(55)+4500, "status": "success",
            "input": {"image_url": "https://.../cat.jpg"}, "output": {"desc": "A tabby cat sitting on a fence."},
            "metrics": {"latency_ms": 4500, "cost": 0.012},
            "attributes": {"model": "gpt-4-vision-preview"}, "tags": []
        }]
    })

    # Send them
    async with httpx.AsyncClient() as client:
        for trace in traces:
            try:
                # Fix: Trace Pydantic model requires 'root_span'
                root = next((s for s in trace['spans'] if not s.get('parent_id')), None)
                if not root:
                    print(f"❌ Error: No root span found for trace {trace['id']}")
                    continue
                trace['root_span'] = root
                
                resp = await client.post(f"{BASE_URL}/traces", json=trace)
                if resp.status_code == 200:
                    print(f"✅ Seeded trace: {trace['spans'][0]['name']}")
                else:
                    print(f"❌ Failed: {resp.text}")
            except Exception as e:
                print(f"❌ Error: {e}")

if __name__ == "__main__":
    asyncio.run(seed_data())
