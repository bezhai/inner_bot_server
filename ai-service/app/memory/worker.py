import json
import logging
from datetime import datetime, timedelta

from arq.connections import RedisSettings
from sqlalchemy import func, select

from app.clients.redis import AsyncRedisClient
from app.config.config import settings
from app.memory.l2_topic_service import (
    get_messages_by_ids,
    update_topic_memory,
)
from app.memory.l3_consensus_service import distill_consensus_daily
from app.orm.base import AsyncSessionLocal
from app.orm.models import ConversationMessage

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

        new_slice = [message.content for message, username in messages]
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


async def _get_active_group_ids(days: int = 1) -> list[str]:
    """获取最近活跃的群组ID列表"""
    async with AsyncSessionLocal() as session:
        since_ts = int((datetime.now() - timedelta(days=days)).timestamp())
        result = await session.execute(
            select(ConversationMessage.chat_id)
            .where(ConversationMessage.create_time >= since_ts)
            .where(ConversationMessage.chat_type == "group")
            .group_by(ConversationMessage.chat_id)
            .having(func.count(ConversationMessage.message_id) >= 10)  # 至少10条消息
        )
        return [row[0] for row in result.all()]


async def task_distill_consensus(ctx, group_id: str) -> None:
    """执行单个群组的共识提炼任务"""
    try:
        logger.info(f"开始共识提炼: {group_id}")
        await distill_consensus_daily(group_id)
        logger.info(f"共识提炼完成: {group_id}")
    except Exception as e:
        logger.error(f"共识提炼失败 {group_id}: {str(e)}")


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


async def cron_daily_consensus(ctx) -> None:
    """每日凌晨2点执行共识提炼"""
    try:
        # 获取最近活跃的群组
        group_ids = await _get_active_group_ids(days=1)
        logger.info(f"发现 {len(group_ids)} 个活跃群组需要共识提炼")

        # 为每个群组创建异步任务
        for group_id in group_ids:
            await ctx["job_def"].enqueue_job("task_distill_consensus", group_id)

        logger.info(f"已为 {len(group_ids)} 个群组创建共识提炼任务")
    except Exception as e:
        logger.error(f"cron_daily_consensus error: {str(e)}")


class WorkerSettings:
    redis_settings = RedisSettings(
        host=settings.redis_host or "localhost",
        port=6379,
        password=settings.redis_password,
        database=0,
    )

    functions = [task_update_topic_memory, task_distill_consensus]
    cron_jobs = [
        # cron(cron_5m_scan_queues, minute=f"*/{settings.l2_scan_interval_minutes}"),
        # cron(cron_daily_consensus, hour=2, minute=0),  # 每天凌晨2点执行
    ]
