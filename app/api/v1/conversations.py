from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.models.user import User
from app.schemas.conversations import ChatCreate, ChatResponse, MessageCreate
from app.services.conversation_service import ChatService
from app.services.llm_service import LLMService
from app.utils.dependencies import get_current_user, get_db

router = APIRouter()


@router.post("/chats", response_model=ChatResponse)
async def create_chat(
    chat: ChatCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import pdb

    pdb.set_trace()
    chat_service = ChatService(db)
    return await chat_service.create_chat(current_user.id, chat)


@router.post("/chats/{chat_id}/messages")
async def create_message(
    chat_id: int,
    message: MessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    llm_service: LLMService = Depends(LLMService),
):
    chat_service = ChatService(db)
    user_message = await chat_service.create_message(chat_id, current_user.id, message)

    # Generate LLM response
    llm_response = await llm_service.generate_response(message.content)
    assistant_message = await chat_service.create_message(
        chat_id, current_user.id, MessageCreate(content=llm_response, role="assistant")
    )

    return {"user_message": user_message, "assistant_message": assistant_message}
