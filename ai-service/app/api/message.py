"""
消息管理API
"""

import asyncio
import json
import logging
import re
import uuid

from fastapi import APIRouter
from pydantic import BaseModel

from app.agents.basic.origin_client import ArkClient, InstructionBuilder, Modality
from app.clients.image_client import image_client
from app.clients.redis import AsyncRedisClient
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
    """异步向量化消息内容（多模态）并写入 Qdrant 双向量库"""
    try:
        # 1. 解析消息内容：提取文本和图片keys
        image_keys = re.findall(r"!\[image\]\(([^)]+)\)", content)
        text_content = re.sub(r"!\[image\]\([^)]+\)", "", content).strip()

        # 2. 批量下载图片转Base64
        image_base64_list = []
        if image_keys:
            tasks = [
                image_client.download_image_as_base64(
                    key, message_id if role == "user" else None
                )
                for key in image_keys
            ]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            image_base64_list = [r for r in results if isinstance(r, str) and r]

        # 3. 并行生成召回和聚类向量
        modality = InstructionBuilder.detect_input_modality(
            text_content, image_base64_list
        )
        recall_instructions = InstructionBuilder.for_corpus(modality)
        cluster_instructions = InstructionBuilder.for_cluster(
            target_modality=modality,
            instruction="Retrieve semantically similar content",
        )

        async with ArkClient("embedding-model") as client:
            recall_task = client.embed_multimodal(
                text_content, image_base64_list, recall_instructions
            )
            cluster_task = client.embed_multimodal(
                text_content, image_base64_list, cluster_instructions
            )
            recall_vector, cluster_vector = await asyncio.gather(
                recall_task, cluster_task
            )

        # 4. 生成向量ID
        vector_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, message_id))

        # 5. 准备payload
        payload = {
            "message_id": message_id,
            "user_id": user_id,
            "chat_id": chat_id,
            "chat_type": chat_type,
            "role": role,
            "timestamp": int(create_time),
        }

        # 6. 并行写入两个collection
        recall_upsert = qdrant_service.upsert_vectors(
            collection="messages_recall",
            vectors=[recall_vector],
            ids=[vector_id],
            payloads=[payload],
        )
        cluster_upsert = qdrant_service.upsert_vectors(
            collection="messages_cluster",
            vectors=[cluster_vector],
            ids=[vector_id],
            payloads=[payload],
        )
        await asyncio.gather(recall_upsert, cluster_upsert)

        logger.info(f"消息 {message_id} 成功写入双向量库（召回+聚类）")

    except Exception as e:
        logger.error(f"消息 {message_id} 向量化写入失败: {str(e)}")


@router.post("/message")
async def create_message(request: MessageCreateRequest):
    create_ts = int(request.create_time)
    await create_conversation_message(
        message_id=request.message_id,
        user_id=request.user_id,
        content=request.content,
        role=request.role,
        root_message_id=request.root_message_id,
        reply_message_id=request.reply_message_id,
        chat_id=request.chat_id,
        chat_type=request.chat_type,
        create_time=create_ts,
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
