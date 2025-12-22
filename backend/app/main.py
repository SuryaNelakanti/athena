from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import asyncio
from contextlib import asynccontextmanager
from sqlmodel import select

from .database import init_db, AsyncSessionLocal
from .models import Project, OrganizationModel
from .routers import proxy as proxy_router
from .routers import views as views_router
from .routers import datasets as datasets_router
from .routers import experiments as experiments_router
from .routers import model_registry as model_registry_router
from .routers import providers as providers_router
from .routers import projects as projects_router
from .routers import logs as logs_router
from .routers import functions as functions_router
from .routers import guardrails as guardrails_router
from .routers import organizations as organizations_router
from .routers import audit as audit_router
from .routers import attachments as attachments_router
from .routers import assignments as assignments_router
from .routers import mentions as mentions_router
from .routers import share_links as share_links_router
from .routers import reviews as reviews_router
from .routers import traces as traces_router
from .routers import aql as aql_router
from .routers import charts as charts_router
from .services.job_worker import JobWorker

# --- Startup ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB (Async)
    await init_db()
    
    # Seed default organization and project if none exist
    async with AsyncSessionLocal() as session:
        # Check and seed default organization
        org_result = await session.execute(select(OrganizationModel))
        if not org_result.scalars().first():
            import time
            default_org = OrganizationModel(
                id="org_default",
                name="Default Organization",
                description="Auto-created default organization",
                created_at=int(time.time() * 1000),
                updated_at=int(time.time() * 1000)
            )
            session.add(default_org)
            await session.commit()
            print("✓ Seeded default organization: org_default")
        
        # Check and seed default project
        project_result = await session.execute(select(Project))
        if not project_result.scalars().first():
            default_project = Project(
                id="proj_default",
                name="Default Project",
                org_id="org_default"
            )
            session.add(default_project)
            await session.commit()
            print("✓ Seeded default project: proj_default")
    
    stop_event = asyncio.Event()
    worker_task = asyncio.create_task(JobWorker.run_forever(stop_event))

    try:
        yield
    finally:
        stop_event.set()
        worker_task.cancel()
        try:
            await worker_task
        except asyncio.CancelledError:
            pass

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
app.include_router(organizations_router.router)
app.include_router(projects_router.router)
app.include_router(logs_router.router)
app.include_router(views_router.router)
app.include_router(datasets_router.router)
app.include_router(experiments_router.router)
app.include_router(model_registry_router.router)
app.include_router(providers_router.router)
app.include_router(functions_router.router)
app.include_router(guardrails_router.router)
app.include_router(audit_router.router)
app.include_router(attachments_router.router)
app.include_router(assignments_router.router)
app.include_router(mentions_router.router)
app.include_router(share_links_router.router)
app.include_router(reviews_router.router)
app.include_router(traces_router.router)
app.include_router(aql_router.router)
app.include_router(charts_router.router)

# --- Endpoints (Async) ---

@app.get("/")
async def read_root():
    return {"message": "Athena API is running with SQLite persistence (Async)"}

