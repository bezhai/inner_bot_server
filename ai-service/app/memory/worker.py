"""
记忆系统Worker
包含L2话题更新和画像更新的调度逻辑
"""

import json
import logging
from datetime import datetime, timedelta

from sqlalchemy import select

from app.clients.redis import AsyncRedisClient
from app.config.config import settings
from app.memory.l2_topic_service import (
    get_messages_by_ids,
    update_topic_memory,
)
from app.memory.profile_agent import update_profiles_from_messages
from app.orm.base import AsyncSessionLocal
from app.orm.models import ConversationMessage, LarkUser
from app.services.quick_search import QuickSearchResult

logger = logging.getLogger(__name__)

# Redis key 前缀
PROFILE_PENDING_PREFIX = "profile:pending:"


# ==================== L2 话题更新相关 ====================


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


# ==================== 画像更新相关 ====================


async def mark_group_pending(chat_id: str, timestamp_ms: int) -> None:
    """
    标记群聊有待处理的消息

    使用SETNX确保只保留最早的时间点

    Args:
        chat_id: 群聊ID
        timestamp_ms: 消息时间戳（毫秒）
    """
    redis = AsyncRedisClient.get_instance()
    key = f"{PROFILE_PENDING_PREFIX}{chat_id}"
    # 只在key不存在时设置，保留最早时间点
    await redis.set(key, str(timestamp_ms), nx=True)


async def _get_messages_by_time_range(
    chat_id: str,
    start_ts: int,
    end_ts: int,
    limit: int = 500,
) -> list[QuickSearchResult]:
    """
    按时间范围获取消息列表

    Args:
        chat_id: 群聊ID
        start_ts: 开始时间戳（毫秒）
        end_ts: 结束时间戳（毫秒）
        limit: 最多返回条数

    Returns:
        QuickSearchResult对象列表
    """
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(ConversationMessage, LarkUser.name.label("username"))
            .outerjoin(LarkUser, ConversationMessage.user_id == LarkUser.union_id)
            .where(ConversationMessage.chat_id == chat_id)
            .where(ConversationMessage.create_time >= start_ts)
            .where(ConversationMessage.create_time <= end_ts)
            .order_by(ConversationMessage.create_time)
            .limit(limit)
        )
        rows = result.all()

        messages = []
        for msg, username in rows:
            messages.append(
                QuickSearchResult(
                    message_id=str(msg.message_id),
                    content=str(msg.content),
                    user_id=str(msg.user_id),
                    create_time=datetime.fromtimestamp(msg.create_time / 1000),
                    role=str(msg.role),
                    username=username if msg.role == "user" else "赤尾",
                    chat_type=str(msg.chat_type),
                    chat_name=None,
                    reply_message_id=str(msg.reply_message_id)
                    if msg.reply_message_id
                    else None,
                )
            )

        return messages


def _check_has_at_bot(messages: list[QuickSearchResult]) -> bool:
    """
    检查消息列表中是否包含@机器人的消息

    Args:
        messages: 消息列表

    Returns:
        是否包含@机器人
    """
    # 检查是否有assistant角色的回复，有回复说明被@了
    for msg in messages:
        if msg.role == "assistant":
            return True
    return False


async def task_update_profile(ctx, chat_id: str) -> None:
    """
    执行单个群聊的画像更新任务

    Args:
        ctx: arq上下文
        chat_id: 群聊ID
    """
    redis = AsyncRedisClient.get_instance()
    lock_key = f"profile:update:lock:{chat_id}"

    # 获取锁，防止重复执行
    got = await redis.set(lock_key, "1", ex=300, nx=True)
    if not got:
        logger.info(f"画像更新任务已在执行中: {chat_id}")
        return

    try:
        pending_key = f"{PROFILE_PENDING_PREFIX}{chat_id}"

        # 获取earliest_ts
        earliest_ts_str = await redis.get(pending_key)
        if not earliest_ts_str:
            logger.info(f"无pending标记，跳过: {chat_id}")
            return

        earliest_ts = int(earliest_ts_str)
        now_ts = int(datetime.now().timestamp() * 1000)

        # 读取时间范围内的消息
        messages = await _get_messages_by_time_range(chat_id, earliest_ts, now_ts)

        if not messages:
            # 无消息，删除key
            await redis.delete(pending_key)
            logger.info(f"无消息，清除pending标记: {chat_id}")
            return

        # 检查触发条件
        msg_count = len(messages)
        has_at_bot = _check_has_at_bot(messages)
        hours_passed = (now_ts - earliest_ts) / 3600000  # 毫秒转小时

        should_update = (
            msg_count >= settings.profile_min_messages
            or has_at_bot
            or hours_passed >= settings.profile_max_delay_hours
        )

        if not should_update:
            logger.info(
                f"未满足更新条件，跳过: {chat_id} "
                f"(消息数={msg_count}, @机器人={has_at_bot}, 时间={hours_passed:.1f}h)"
            )
            return

        # 先删除key，再执行更新（更新是耗时操作）
        await redis.delete(pending_key)

        # 执行画像更新
        logger.info(
            f"开始画像更新: {chat_id} "
            f"(消息数={msg_count}, @机器人={has_at_bot}, 时间={hours_passed:.1f}h)"
        )

        result = await update_profiles_from_messages(chat_id, messages)

        if result.get("success"):
            logger.info(f"画像更新完成: {chat_id}")
        else:
            logger.error(f"画像更新失败: {chat_id}, error={result.get('error')}")

    except Exception as e:
        logger.error(f"task_update_profile error {chat_id}: {str(e)}")
    finally:
        await redis.delete(lock_key)


async def cron_2h_scan_profile_pending(ctx) -> None:
    """
    每2小时扫描待处理的画像更新

    扫描所有 profile:pending:* keys，为满足条件的群聊创建更新任务
    """
    redis = AsyncRedisClient.get_instance()
    now_ts = int(datetime.now().timestamp() * 1000)

    cursor = "0"
    pattern = f"{PROFILE_PENDING_PREFIX}*"
    processed_count = 0
    triggered_count = 0

    while True:
        cursor, keys = await redis.scan(cursor=cursor, match=pattern, count=100)
        for key in keys:
            processed_count += 1
            chat_id = key.replace(PROFILE_PENDING_PREFIX, "")

            try:
                # 获取earliest_ts
                earliest_ts_str = await redis.get(key)
                if not earliest_ts_str:
                    continue

                earliest_ts = int(earliest_ts_str)
                hours_passed = (now_ts - earliest_ts) / 3600000

                # 读取消息计数（不读取全部消息，只计数）
                async with AsyncSessionLocal() as session:
                    from sqlalchemy import func

                    result = await session.execute(
                        select(func.count(ConversationMessage.message_id))
                        .where(ConversationMessage.chat_id == chat_id)
                        .where(ConversationMessage.chat_type == "group")
                        .where(ConversationMessage.create_time >= earliest_ts)
                        .where(ConversationMessage.create_time <= now_ts)
                    )
                    msg_count = result.scalar() or 0

                # 检查是否有@机器人（通过检查是否有assistant回复）
                async with AsyncSessionLocal() as session:
                    result = await session.execute(
                        select(func.count(ConversationMessage.message_id))
                        .where(ConversationMessage.chat_id == chat_id)
                        .where(ConversationMessage.role == "assistant")
                        .where(ConversationMessage.create_time >= earliest_ts)
                        .where(ConversationMessage.create_time <= now_ts)
                    )
                    has_at_bot = (result.scalar() or 0) > 0

                # 检查触发条件
                should_update = (
                    msg_count >= settings.profile_min_messages
                    or has_at_bot
                    or hours_passed >= settings.profile_max_delay_hours
                )

                if should_update and msg_count > 0:
                    # 创建更新任务
                    await ctx["job_def"].enqueue_job("task_update_profile", chat_id)
                    triggered_count += 1
                    logger.info(
                        f"触发画像更新: {chat_id} "
                        f"(消息数={msg_count}, @机器人={has_at_bot}, 时间={hours_passed:.1f}h)"
                    )

            except Exception as e:
                logger.error(f"处理pending key失败 {chat_id}: {str(e)}")
                continue

        if cursor == "0":
            break

    logger.info(
        f"画像更新扫描完成: 扫描 {processed_count} 个群聊, 触发 {triggered_count} 个更新任务"
    )


# ==================== 废弃的L3记忆更新（保留用于兼容） ====================


async def task_evolve_memory(ctx, group_id: str) -> None:
    """
    执行单个群组的记忆更新任务（已废弃）

    此函数保留用于向后兼容，新系统请使用 task_update_profile
    """
    logger.warning(
        f"task_evolve_memory 已废弃，请使用 task_update_profile: {group_id}"
    )
    # 转发到新的画像更新任务
    await task_update_profile(ctx, group_id)


async def cron_daily_memory_evolve(ctx) -> None:
    """
    每日凌晨2点执行记忆更新（已废弃）

    此函数保留用于向后兼容，新系统使用 cron_2h_scan_profile_pending
    """
    logger.warning("cron_daily_memory_evolve 已废弃，请使用 cron_2h_scan_profile_pending")
