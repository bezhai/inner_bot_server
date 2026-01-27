"""
向量化 Worker - 消费 Redis Stream 中的消息并进行向量化处理

使用 Redis Stream + Consumer Group 实现可靠的消息队列：
1. 消息持久化 - 消息写入后不会丢失
2. ACK 机制 - 只有消费者确认后消息才算处理完成
3. Pending 重试 - 消费者挂掉后，pending 消息可以被其他消费者接管

启动命令：
    uv run python -m app.workers.vectorize_worker
"""

import asyncio
import logging
import os
import re
import signal
import uuid

from redis.asyncio import Redis
from redis.exceptions import ResponseError
from sqlalchemy import update
from sqlalchemy.future import select

from app.agents import InstructionBuilder, create_client
from app.clients.image_client import image_client
from app.clients.redis import AsyncRedisClient
from app.orm.base import AsyncSessionLocal
from app.orm.models import ConversationMessage
from app.services.qdrant import qdrant_service

logger = logging.getLogger(__name__)

# Redis Stream 配置
STREAM_NAME = "vectorize_stream"
GROUP_NAME = "vectorize_workers"
CONSUMER_NAME = f"worker-{os.getpid()}"

# 重试配置
MAX_RETRIES = 3  # 最大重试次数
RETRY_DELAY_MS = 60000  # 重试间隔（毫秒）

# 控制 worker 运行状态
_running = True


def _handle_signal(signum, frame):
    """处理终止信号"""
    global _running
    logger.info(f"收到信号 {signum}，准备优雅退出...")
    _running = False


async def get_message_by_id(message_id: str) -> ConversationMessage | None:
    """从数据库获取消息"""
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(ConversationMessage).where(
                ConversationMessage.message_id == message_id
            )
        )
        return result.scalar_one_or_none()


async def update_vector_status(message_id: str, status: str) -> None:
    """更新消息的向量化状态"""
    async with AsyncSessionLocal() as session:
        await session.execute(
            update(ConversationMessage)
            .where(ConversationMessage.message_id == message_id)
            .values(vector_status=status)
        )
        await session.commit()


async def vectorize_message(message: ConversationMessage) -> bool:
    """
    向量化消息内容并写入 Qdrant

    写入两个集合：
    1. messages_recall: 混合向量（Dense + Sparse），用于混合检索
    2. messages_cluster: 聚类向量，用于消息聚类

    Returns:
        bool: True 表示成功处理，False 表示内容为空需跳过
    """
    # 1. 解析消息内容：提取文本和图片keys
    image_keys = re.findall(r"!\[image\]\(([^)]+)\)", message.content)
    text_content = re.sub(r"!\[image\]\([^)]+\)", "", message.content).strip()

    # 2. 判断是否为空内容（文本为空且无图片）
    if not text_content and not image_keys:
        logger.info(f"消息 {message.message_id} 内容为空，跳过向量化")
        return False

    # 3. 批量下载图片转Base64
    image_base64_list: list[str] = []
    if image_keys:
        # bot_name 默认 bytedance（兼容历史数据）
        bot_name = message.bot_name or "bytedance"
        tasks = [
            image_client.download_image_as_base64(key, message.message_id, bot_name)
            for key in image_keys
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        image_base64_list = [r for r in results if isinstance(r, str) and r]

    # 4. 生成向量
    modality = InstructionBuilder.detect_input_modality(text_content, image_base64_list)
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
    vector_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, message.message_id))

    # 5. 准备payload
    hybrid_payload = {
        "message_id": message.message_id,
        "user_id": message.user_id,
        "chat_id": message.chat_id,
        "timestamp": message.create_time,
        "root_message_id": message.root_message_id,
        "original_text": text_content,
    }
    cluster_payload = {
        "message_id": message.message_id,
        "user_id": message.user_id,
        "chat_id": message.chat_id,
        "timestamp": message.create_time,
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
    return True


async def process_message(redis: Redis, stream_id: str, message_id: str) -> None:
    """处理单条消息"""
    try:
        # 1. 从数据库获取完整消息
        message = await get_message_by_id(message_id)
        if not message:
            logger.warning(f"消息 {message_id} 不存在，跳过")
            await redis.xack(STREAM_NAME, GROUP_NAME, stream_id)
            return

        # 2. 执行向量化
        success = await vectorize_message(message)

        # 3. 根据结果更新状态
        if success:
            await update_vector_status(message_id, "completed")
            logger.info(f"消息 {message_id} 向量化完成")
        else:
            await update_vector_status(message_id, "skipped")
            logger.info(f"消息 {message_id} 内容为空，已跳过")

        # 4. ACK 消息
        await redis.xack(STREAM_NAME, GROUP_NAME, stream_id)

    except Exception as e:
        logger.error(f"消息 {message_id} 向量化失败: {e}")
        # 更新状态为失败，但不 ACK，消息会保留在 pending 中
        await update_vector_status(message_id, "failed")


async def consume_stream() -> None:
    """消费 Redis Stream"""
    redis = AsyncRedisClient.get_instance()

    # 创建消费者组（如果不存在）
    try:
        await redis.xgroup_create(STREAM_NAME, GROUP_NAME, id="0", mkstream=True)
        logger.info(f"创建消费者组 {GROUP_NAME}")
    except ResponseError as e:
        if "BUSYGROUP" not in str(e):
            raise
        # 组已存在，忽略

    logger.info(f"启动向量化 Worker: {CONSUMER_NAME}")

    while _running:
        try:
            # 1. 先处理 pending 消息（之前消费失败的）
            pending_info = await redis.xpending(STREAM_NAME, GROUP_NAME)
            if pending_info and pending_info["pending"] > 0:
                # 获取 pending 消息
                pending_messages = await redis.xpending_range(
                    STREAM_NAME, GROUP_NAME, min="-", max="+", count=10
                )
                for pending in pending_messages:
                    stream_id = pending["message_id"]
                    times_delivered = pending["times_delivered"]

                    # 检查是否超过最大重试次数
                    if times_delivered > MAX_RETRIES:
                        logger.warning(
                            f"消息 {stream_id} 已重试 {times_delivered} 次，放弃重试"
                        )
                        # 超过重试次数，ACK 消息避免无限堆积
                        await redis.xack(STREAM_NAME, GROUP_NAME, stream_id)
                        continue

                    # 如果消息已经 pending 超过重试间隔，尝试重新处理
                    if pending["time_since_delivered"] > RETRY_DELAY_MS:
                        # 认领消息
                        claimed = await redis.xclaim(
                            STREAM_NAME,
                            GROUP_NAME,
                            CONSUMER_NAME,
                            min_idle_time=RETRY_DELAY_MS,
                            message_ids=[stream_id],
                        )
                        for claimed_id, data in claimed:
                            if data and "message_id" in data:
                                logger.info(
                                    f"重试消息 {data['message_id']}，"
                                    f"第 {times_delivered} 次尝试"
                                )
                                await process_message(
                                    redis, claimed_id, data["message_id"]
                                )

            # 2. 读取新消息
            messages = await redis.xreadgroup(
                GROUP_NAME,
                CONSUMER_NAME,
                streams={STREAM_NAME: ">"},
                count=10,
                block=5000,  # 阻塞 5 秒
            )

            if messages:
                for _stream_name, entries in messages:
                    for stream_id, data in entries:
                        if data and "message_id" in data:
                            await process_message(redis, stream_id, data["message_id"])

        except Exception as e:
            logger.error(f"消费循环异常: {e}")
            await asyncio.sleep(5)  # 出错后等待重试

    logger.info("Worker 已停止")


async def main():
    """主入口"""
    # 注册信号处理
    signal.signal(signal.SIGINT, _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)

    # 配置日志
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )

    await consume_stream()


if __name__ == "__main__":
    asyncio.run(main())
