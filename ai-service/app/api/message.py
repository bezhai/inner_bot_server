"""
消息管理API
"""

from fastapi import APIRouter
from pydantic import BaseModel

from app.orm.crud import create_conversation_message
from app.clients.redis import AsyncRedisClient

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
    await create_conversation_message(
        message_id=request.message_id,
        user_id=request.user_id,
        content=request.content,
        role=request.role,
        root_message_id=request.root_message_id,
        reply_message_id=request.reply_message_id,
        chat_id=request.chat_id,
        chat_type=request.chat_type,
        create_time=int(request.create_time),
    )
    # L2 队列入队：按 chat 维度
    redis = AsyncRedisClient.get_instance()
    queue_key = f"l2:queue:{request.chat_id}"
    # 仅推入轻量信息，正文不必入队
    payload = {
        "message_id": request.message_id,
        "user_id": request.user_id,
        "create_time": request.create_time,
    }
    await redis.rpush(queue_key, str(payload))
    # 可选限长，保留最近200条触发信号
    await redis.ltrim(queue_key, -200, -1)
    return {"status": "ok"}
