import httpx
import asyncio

async def test_filtering():
    base_url = "http://localhost:8000"
    
    # 1. Get Projects
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{base_url}/projects")
        projects = resp.json()
        if not projects:
            print("No projects found. Cannot test.")
            return
        
        project_id = projects[0]['id']
        print(f"Testing project: {project_id}")
        
        # 2. Get All Traces
        resp = await client.get(f"{base_url}/projects/{project_id}/traces")
        all_traces = resp.json()
        print(f"Total traces: {len(all_traces)}")
        
        if not all_traces:
            print("No traces to filter.")
            return

        # 3. Test Status Filter
        print("\n--- Testing Status Filter (status=error) ---")
        resp = await client.get(f"{base_url}/projects/{project_id}/traces?status=error")
        error_traces = resp.json()
        print(f"Error traces found: {len(error_traces)}")
        for t in error_traces:
            if t['status'] != 'error':
                print(f"FAIL: Found trace with status {t['status']} when filtering for error")
        
        # 4. Test Search Filter
        # Pick a name from all_traces to search for
        target_name = all_traces[0]['root_span']['name']
        search_term = target_name[:4] # First 4 chars
        print(f"\n--- Testing Search Filter (search={search_term}) ---")
        
        resp = await client.get(f"{base_url}/projects/{project_id}/traces", params={"search": search_term})
        search_traces = resp.json()
        print(f"Search results: {len(search_traces)}")
        
        found = False
        for t in search_traces:
            if search_term.lower() in t['root_span']['name'].lower():
                found = True
        
        if not found and len(search_traces) > 0:
             print(f"WARN: Search term '{search_term}' not clearly visible in root span names.")

if __name__ == "__main__":
    asyncio.run(test_filtering())
