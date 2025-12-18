import httpx
import asyncio
import json

BASE_URL = "http://localhost:8000"

async def test_datasets_and_experiments():
    print("--- Testing Datasets & Experiments API ---")
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        # 0. Check if projects exist, create if not
        projects_resp = await client.get(f"{BASE_URL}/projects")
        projects = projects_resp.json()
        if not projects:
            print("No projects found. Seeding a test project and trace...")
            # Create a project (Traces endpoint handles upserting project roughly?)
            # Actually, let's just create a trace which implicitly creates project/traces for our tests
            seed_trace = {
                "id": "trace_seed_001",
                "project_id": "proj_alpha",
                "timestamp": 1700000000,
                "total_latency": 150.5,
                "total_cost": 0.002,
                "total_tokens": 100,
                "status": "success",
                "root_span": {
                    "id": "span_seed_001",
                    "trace_id": "trace_seed_001",
                    "name": "Seed Span",
                    "type": "tool",
                    "start_time": 1700000000,
                    "end_time": 1700000150,
                    "status": "success",
                    "input": {"prompt": "Hello"},
                    "output": {"response": "Hi there"},
                    "metrics": {"latency": 0.15, "cost": 0.001, "tokens": 50},
                    "attributes": {},
                    "tags": []
                },
                "spans": []
            }
            # Add the root span to the list of spans too (as per Trace model)
            seed_trace["spans"].append(seed_trace["root_span"])
            
            await client.post(f"{BASE_URL}/traces", json=seed_trace)
            
            # Re-fetch projects
            projects_resp = await client.get(f"{BASE_URL}/projects")
            projects = projects_resp.json()
        
        project_id = projects[0]['id']
        print(f"Using Project: {project_id}")

        # 1. Create a Dataset
        print("\n1. Creating Dataset...")
        ds_payload = {
            "name": "Verification Dataset",
            "project_id": project_id,
            "description": "Created for automated verification"
        }
        ds_resp = await client.post(f"{BASE_URL}/datasets/", json=ds_payload)
        if ds_resp.status_code != 200:
            print(f"Failed to create dataset: {ds_resp.text}")
            return
        dataset = ds_resp.json()
        dataset_id = dataset['id']
        print(f"Dataset Created: {dataset_id}")

        # 1b. Test Duplicate Dataset Name
        print("\n1b. Testing Duplicate Dataset Name...")
        dup_ds_resp = await client.post(f"{BASE_URL}/datasets/", json=ds_payload)
        if dup_ds_resp.status_code == 400:
            print("Duplicate dataset name prevented (Expected)")
        else:
            print(f"FAILED: Duplicate dataset name allowed: {dup_ds_resp.status_code}")

        # 2. Add a Row to Dataset
        print("\n2. Adding Dataset Row...")
        row_payload = {
            "input": {"prompt": "What is 2+2?"},
            "expected": {"answer": "4"},
            "meta": {}
        }
        row_resp = await client.post(f"{BASE_URL}/datasets/{dataset_id}/rows", json=row_payload)
        if row_resp.status_code != 200:
            print(f"Failed to add row: {row_resp.text}")
            return
        print(f"Row Added: {row_resp.json()['id']}")

        # 3. Create an Experiment
        print("\n3. Creating Experiment...")
        exp_payload = {
            "name": "Verification Eval",
            "project_id": project_id,
            "dataset_id": dataset_id,
            "summary": {"avg_score": 0.85}
        }
        exp_resp = await client.post(f"{BASE_URL}/experiments/", json=exp_payload)
        if exp_resp.status_code != 200:
            print(f"Failed to create experiment: {exp_resp.text}")
            return
        experiment = exp_resp.json()
        experiment_id = experiment['id']
        print(f"Experiment Created: {experiment_id}")

        # 3b. Test Duplicate Experiment Name
        print("\n3b. Testing Duplicate Experiment Name...")
        dup_exp_resp = await client.post(f"{BASE_URL}/experiments/", json=exp_payload)
        if dup_exp_resp.status_code == 400:
            print("Duplicate experiment name prevented (Expected)")
        else:
            print(f"FAILED: Duplicate experiment name allowed: {dup_exp_resp.status_code}")

        # 4. List Datasets and Experiments for project
        print("\n4. Verifying Lists...")
        list_ds_resp = await client.get(f"{BASE_URL}/datasets/?project_id={project_id}")
        print(f"Datasets count: {len(list_ds_resp.json())}")
        
        list_exp_resp = await client.get(f"{BASE_URL}/experiments/?project_id={project_id}")
        print(f"Experiments count: {len(list_exp_resp.json())}")

        # 5. Promote a Trace to Dataset
        print("\n5. Testing Promotion...")
        # Get a trace ID
        traces_resp = await client.get(f"{BASE_URL}/projects/{project_id}/traces")
        traces = traces_resp.json()
        if traces:
            trace_id = traces[0]['id']
            print(f"Promoting Trace: {trace_id}")
            prom_resp = await client.post(f"{BASE_URL}/datasets/promote?trace_id={trace_id}&dataset_id={dataset_id}")
            if prom_resp.status_code == 200:
                print(f"Promotion Successful: {prom_resp.json()['id']}")
            else:
                print(f"Promotion Failed: {prom_resp.text}")
        else:
            print("No traces found to test promotion.")

        print("\n--- Verification Complete! ---")

if __name__ == "__main__":
    asyncio.run(test_datasets_and_experiments())
