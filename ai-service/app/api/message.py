"""
消息管理API
"""

from datetime import datetime

from fastapi import APIRouter
from pydantic import BaseModel

from app.orm.crud import create_conversation_message

router = APIRouter()


class MessageCreateRequest(BaseModel):
    message_id: str
    user_id: str
    content: str
    role: str
    root_message_id: str
    reply_message_id: str | None = None
    chat_id: str
    chat_type: str
    create_time: str


@router.post("/message")
async def create_message(request: MessageCreateRequest):
    create_time = datetime.fromisoformat(request.create_time.replace("Z", "+00:00"))

    await create_conversation_message(
        message_id=request.message_id,
        user_id=request.user_id,
        content=request.content,
        role=request.role,
        root_message_id=request.root_message_id,
        reply_message_id=request.reply_message_id,
        chat_id=request.chat_id,
        chat_type=request.chat_type,
        create_time=create_time,
    )
    return {"status": "ok"}
