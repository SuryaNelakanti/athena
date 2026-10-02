from fastapi import APIRouter

from app.routers.mcp_oauth import oauth_router
from app.routers.mcp_tools import tools_router

router = APIRouter()
router.include_router(oauth_router)
router.include_router(tools_router)
