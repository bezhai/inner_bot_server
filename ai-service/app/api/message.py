"""
消息管理API
"""

import asyncio
import logging
import re
import uuid

from fastapi import APIRouter
from pydantic import BaseModel

from app.agents import InstructionBuilder, create_client
from app.clients.image_client import image_client
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
    root_message_id: str,
    chat_id: str,
    create_time: str,
) -> None:
    """异步向量化消息内容并写入 Qdrant

    写入两个集合：
    1. messages_recall: 混合向量（Dense + Sparse），用于混合检索
    2. messages_cluster: 聚类向量，用于消息聚类
    """
    try:
        # 1. 解析消息内容：提取文本和图片keys
        image_keys = re.findall(r"!\[image\]\(([^)]+)\)", content)
        text_content = re.sub(r"!\[image\]\([^)]+\)", "", content).strip()

        # 2. 批量下载图片转Base64
        image_base64_list: list[str] = []
        if image_keys:
            tasks = [
                image_client.download_image_as_base64(key, message_id)
                for key in image_keys
            ]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            image_base64_list = [r for r in results if isinstance(r, str) and r]

        # 3. 生成向量
        modality = InstructionBuilder.detect_input_modality(
            text_content, image_base64_list
        )
        corpus_instructions = InstructionBuilder.for_corpus(modality)
        cluster_instructions = InstructionBuilder.for_cluster(
            target_modality=modality,
            instruction="Retrieve semantically similar content",
        )

        async with await create_client("embedding-model") as client:
            # 并行生成混合向量和聚类向量
            hybrid_task = client.embed_hybrid(
                text=text_content or None,
                image_base64_list=image_base64_list or None,
                instructions=corpus_instructions,
            )
            cluster_task = client.embed(
                text=text_content or None,
                image_base64_list=image_base64_list or None,
                instructions=cluster_instructions,
            )
            hybrid_embedding, cluster_vector = await asyncio.gather(
                hybrid_task, cluster_task
            )

        # 4. 生成向量ID
        vector_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, message_id))

        # 5. 准备payload
        hybrid_payload = {
            "message_id": message_id,
            "user_id": user_id,
            "chat_id": chat_id,
            "timestamp": int(create_time),
            "root_message_id": root_message_id,
            "original_text": text_content,
        }
        cluster_payload = {
            "message_id": message_id,
            "user_id": user_id,
            "chat_id": chat_id,
            "timestamp": int(create_time),
        }

        # 6. 并行写入两个集合
        hybrid_upsert = qdrant_service.upsert_hybrid_vectors(
            collection_name="messages_recall",
            point_id=vector_id,
            dense_vector=hybrid_embedding.dense,
            sparse_indices=hybrid_embedding.sparse.indices,
            sparse_values=hybrid_embedding.sparse.values,
            payload=hybrid_payload,
        )
        cluster_upsert = qdrant_service.upsert_vectors(
            collection="messages_cluster",
            vectors=[cluster_vector],
            ids=[vector_id],
            payloads=[cluster_payload],
        )
        await asyncio.gather(hybrid_upsert, cluster_upsert)

        logger.info(f"消息 {message_id} 成功写入向量库")

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

    # 异步向量化并写入 Qdrant（后台执行，不阻塞响应）
    asyncio.create_task(
        _vectorize_and_store_message(
            message_id=request.message_id,
            user_id=request.user_id,
            content=request.content,
            root_message_id=request.root_message_id,
            chat_id=request.chat_id,
            create_time=request.create_time,
        )
    )

    return {"status": "ok"}
