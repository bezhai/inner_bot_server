"""
消息管理API
"""

import asyncio
import json
import logging
import uuid

from fastapi import APIRouter
from pydantic import BaseModel

from app.clients.redis import AsyncRedisClient
from app.memory.l3_consensus_service import embed_text
from app.orm.crud import create_conversation_message
from app.services.qdrant import qdrant_service

router = APIRouter()
logger = logging.getLogger(__name__)


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


async def _vectorize_and_store_message(
    message_id: str,
    user_id: str,
    content: str,
    role: str,
    chat_id: str,
    chat_type: str,
    create_time: str,
) -> None:
    """异步向量化消息内容并写入 Qdrant 向量库"""
    try:
        # 生成向量
        vector = await embed_text(content)

        # 生成确定性 UUID（相同 message_id 总是生成相同 UUID，保证幂等性）
        vector_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, message_id))

        # 写入 Qdrant
        await qdrant_service.upsert_vectors(
            collection="messages",
            vectors=[vector],
            ids=[vector_id],
            payloads=[
                {
                    "message_id": message_id,
                    "user_id": user_id,
                    "chat_id": chat_id,
                    "chat_type": chat_type,
                    "role": role,
                    "timestamp": int(create_time),
                }
            ],
        )
        logger.info(f"消息 {message_id} 成功写入向量库")
    except Exception as e:
        logger.error(f"消息 {message_id} 向量化写入失败: {str(e)}")


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
    await redis.rpush(queue_key, json.dumps(payload))
    # 可选限长，保留最近200条触发信号
    # await redis.ltrim(queue_key, -200, -1)

    # 异步向量化并写入 Qdrant（后台执行，不阻塞响应）
    asyncio.create_task(
        _vectorize_and_store_message(
            message_id=request.message_id,
            user_id=request.user_id,
            content=request.content,
            role=request.role,
            chat_id=request.chat_id,
            chat_type=request.chat_type,
            create_time=request.create_time,
        )
    )

    return {"status": "ok"}
