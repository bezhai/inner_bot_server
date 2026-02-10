import asyncio
import json
import logging
from datetime import datetime

from app.clients.redis import AsyncRedisClient
from app.config.config import settings
from app.memory.l2_topic_service import (
    get_messages_by_ids,
    update_topic_memory,
)
from app.memory.l3_memory_service import evolve_group_profile, fetch_active_chat_ids
from app.utils.content_parser import parse_content

logger = logging.getLogger(__name__)

PROFILE_KEY_PREFIX = settings.l3_profile_redis_prefix
PROFILE_LOCK_PREFIX = f"{PROFILE_KEY_PREFIX}:lock"
PROFILE_SCAN_PATTERN = f"{PROFILE_KEY_PREFIX}:*"


async def _should_trigger(now_ts: int, last_update_ts: int | None, qlen: int) -> bool:
    if qlen >= settings.l2_queue_trigger_threshold:
        return True
    if last_update_ts is None:
        return True
    if now_ts - last_update_ts >= settings.l2_force_update_after_minutes * 60:
        return True
    return False


async def task_update_topic_memory(ctx, chat_id: str) -> None:
    redis = AsyncRedisClient.get_instance()
    lock_key = f"l2:update:lock:{chat_id}"
    got = await redis.set(lock_key, "1", ex=120, nx=True)
    if not got:
        return
    try:
        queue_key = f"l2:queue:{chat_id}"

        # 1. 从队列读取所有累积的message_id
        queue_items = await redis.lrange(queue_key, 0, -1)
        if not queue_items:
            logger.info(f"队列为空，跳过更新: {chat_id}")
            return

        # 2. 解析队列中的message_id
        message_ids = []
        for item in queue_items:
            try:
                payload = json.loads(item)
                message_ids.append(payload["message_id"])
            except Exception as e:
                logger.warning(f"解析队列项失败: {e}")
                continue

        if not message_ids:
            logger.warning(f"队列中无有效message_id: {chat_id}")
            await redis.delete(queue_key)
            return

        # 3. 根据message_id查询消息内容
        messages = await get_messages_by_ids(message_ids)
        if not messages:
            logger.warning(f"未找到对应消息: {chat_id}")
            await redis.delete(queue_key)
            return

        new_slice = [parse_content(message.content).render() for message, username in messages]
        logger.info(f"处理 {len(new_slice)} 条新消息用于话题更新: {chat_id}")

        # 4. 使用这些新消息进行话题重写
        await update_topic_memory(chat_id, new_slice)

        # 5. 处理完成后清空队列并更新时间戳
        now_ts = int(datetime.now().timestamp())
        await redis.set(f"l2:last_update:{chat_id}", str(now_ts), ex=86400)
        await redis.delete(queue_key)
        logger.info(f"话题记忆更新完成: {chat_id}")
    except Exception as e:
        logger.error(f"task_update_topic_memory error: {str(e)}")
    finally:
        await redis.delete(lock_key)


async def cron_5m_scan_queues(ctx) -> None:
    """每5分钟扫描L2队列，触发话题更新"""
    redis = AsyncRedisClient.get_instance()
    now_ts = int(datetime.now().timestamp())

    cursor = "0"
    pattern = "l2:queue:*"
    while True:
        cursor, keys = await redis.scan(cursor=cursor, match=pattern, count=100)
        for key in keys:
            chat_id = key.split(":", 2)[-1]
            qlen = await redis.llen(key)
            last = await redis.get(f"l2:last_update:{chat_id}")
            last_ts = int(last) if last else None
            if await _should_trigger(now_ts, last_ts, qlen):
                await ctx["job_def"].enqueue_job("task_update_topic_memory", chat_id)
        if cursor == "0":
            break


async def _process_profile_window(chat_id: str, start_ts_ms: int) -> None:
    redis = AsyncRedisClient.get_instance()
    lock_key = f"{PROFILE_LOCK_PREFIX}:{chat_id}"
    got = await redis.set(lock_key, "1", nx=True, ex=900)
    if not got:
        return

    try:
        await evolve_group_profile(chat_id, start_ts_ms)

        logger.info(
            "群聊画像更新成功 chat_id=%s",
            chat_id,
        )
    except Exception as e:
        logger.error("画像更新失败 chat_id=%s error=%s", chat_id, str(e))
    finally:
        await redis.delete(lock_key)


async def cron_profile_scan(ctx) -> None:
    """每 30 分钟扫描需要触发画像更新的群聊 (并发: 2)"""

    now_ts = datetime.now().timestamp()
    start_ts_ms = int((now_ts - (30 * 60)) * 1000)

    chat_ids = await fetch_active_chat_ids()

    sem = asyncio.Semaphore(2)

    async def sem_task(c_id):
        """包装函数：负责获取锁和释放锁"""
        async with sem:
            try:
                await _process_profile_window(c_id, start_ts_ms)
            except Exception as e:
                print(f"Error processing {c_id}: {e}")

    tasks = [sem_task(chat_id) for chat_id in chat_ids]

    if tasks:
        await asyncio.gather(*tasks)
