from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.schemas.session_ingest import SessionIngestRequest, SessionIngestResponse
from app.services.session_ingest_service import SessionIngestError, SessionIngestService

router = APIRouter(tags=["ingest"])


@router.post("/ingest", response_model=SessionIngestResponse)
async def ingest_session(
    payload: SessionIngestRequest,
    session: AsyncSession = Depends(get_session),
):
    try:
        return await SessionIngestService(session).ingest(payload)
    except SessionIngestError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
