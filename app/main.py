from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1 import auth, chat, users, artifacts
from app.core.config import settings
from app.db.session import engine
from app.db.base import Base

app = FastAPI(title=settings.PROJECT_NAME, version=settings.PROJECT_VERSION)

# Set up CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create database tables
Base.metadata.create_all(bind=engine)

# Include routers
app.include_router(auth.router, prefix="/api/v1")
app.include_router(chat.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(artifacts.router, prefix="/api/v1")
