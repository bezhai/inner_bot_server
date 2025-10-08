import asyncio
import json
import logging
from datetime import datetime, timedelta

from arq import cron
from arq.connections import RedisSettings

from app.clients.redis import AsyncRedisClient
from app.config.config import settings
from app.memory.l2_topic_service import (
    get_latest_messages_for_chat,
    update_topic_memory,
)

logger = logging.getLogger(__name__)


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
        # 拉取最新消息切片
        messages = await get_latest_messages_for_chat(
            chat_id, limit=30, minutes=30
        )
        new_slice = [m.content for m in messages]
        # 假设 group_id == chat_id（如需不同，可在 DB schema 提供映射）
        await update_topic_memory(chat_id, new_slice)
        # 更新 last_update 并清空队列
        now_ts = int(datetime.now().timestamp())
        await redis.set(f"l2:last_update:{chat_id}", str(now_ts), ex=86400)
        await redis.delete(f"l2:queue:{chat_id}")
    except Exception as e:
        logger.error(f"task_update_topic_memory error: {str(e)}")
    finally:
        await redis.delete(lock_key)


async def cron_5m_scan_queues(ctx) -> None:
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
                await ctx['job_def'].enqueue_job("task_update_topic_memory", chat_id)
        if cursor == "0":
            break


class WorkerSettings:
    redis_settings = RedisSettings(
        host=settings.redis_host or "localhost",
        port=6379,
        password=settings.redis_password,
        database=0,
    )

    functions = [task_update_topic_memory]
    cron_jobs = [cron(cron_5m_scan_queues, minute=f"*/{settings.l2_scan_interval_minutes}")]

