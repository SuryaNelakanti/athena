import httpx
import asyncio

BASE_URL = "http://localhost:8000"

async def inspect_projects():
    async with httpx.AsyncClient() as client:
        # 1. Get Projects
        resp = await client.get(f"{BASE_URL}/projects")
        projects = resp.json()
        print(f"Projects found: {len(projects)}")
        for p in projects:
            print(f" - ID: {p['id']}, Name: {p['name']}")
            
            # 2. Get Count for each
            resp = await client.get(f"{BASE_URL}/projects/{p['id']}/traces")
            traces = resp.json()
            print(f"   -> Trace Count: {len(traces)}")

if __name__ == "__main__":
    asyncio.run(inspect_projects())
