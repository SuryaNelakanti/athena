from fastapi import APIRouter, Depends, HTTPException, Header
from fastapi.responses import StreamingResponse
from typing import Annotated

from sqlmodel import Session
from app.database import get_session
from app.schemas.proxy import ChatCompletionRequest, ChatCompletionResponse, ModelListResponse
from app.services.proxy_service import ProxyService

router = APIRouter(prefix="/v1")

@router.post("/chat/completions")
async def chat_completions(
    request: ChatCompletionRequest,
    session: Session = Depends(get_session),
    authorization: Annotated[str | None, Header()] = None # We might need this for passing keys or auth later
    # TODO: Auth Middleware to validate Athena API keys
):
    service = ProxyService(session)
    
    # Optional: Extract project_id from headers or token
    project_id = "default_project" 
    
    try:
        if request.stream:
            return StreamingResponse(
                service.stream_chat_completion(request, project_id),
                media_type="text/event-stream"
            )
        else:
            return await service.chat_completion(request, project_id)
            
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        # TODO: Better error handling/mapping
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/models", response_model=ModelListResponse)
async def list_models(session: Session = Depends(get_session)):
    service = ProxyService(session)
    models = await service.list_models()
    return ModelListResponse(data=models)
