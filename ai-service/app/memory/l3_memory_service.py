"""
L3画像 orchestrator

基于 LangChain Tool & PG 的用户/群聊画像维护
"""

import json
import logging
from dataclasses import dataclass
from datetime import datetime

from langchain.messages import HumanMessage
from sqlalchemy import select

from app.agents.basic import ChatAgent
from app.agents.memory.tools import PROFILE_TOOLS
from app.clients.redis import AsyncRedisClient
from app.config.config import settings
from app.orm.base import AsyncSessionLocal
from app.orm.models import ConversationMessage, LarkUser
from app.services.quick_search import QuickSearchResult
from app.utils.message_formatter import format_messages_to_strings

logger = logging.getLogger(__name__)

PROFILE_PROMPT_ID = "memory_profile_update"
PROFILE_KEY_PREFIX = settings.l3_profile_redis_prefix


def _profile_key(chat_id: str) -> str:
    return f"{PROFILE_KEY_PREFIX}:{chat_id}"


@dataclass
class ProfileUpdateResult:
    group_id: str
    updated: bool
    message_count: int
    has_bot_mention: bool
    reason: str | None = None
    agent_summary: str | None = None
    window_start: datetime | None = None
    window_end: datetime | None = None


def _contains_bot_mention(content: str) -> bool:
    """尽可能识别@机器人信号"""
    if not content:
        return False

    lowered = content.lower()
    if '"is_mention_bot": true' in lowered:
        return True

    keywords = ["@赤尾", "@小尾", "@机器人", "@bot", "@ai"]
    if any(keyword.lower() in lowered for keyword in keywords):
        return True

    try:
        parsed = json.loads(content)
        if isinstance(parsed, dict):
            if parsed.get("is_mention_bot"):
                return True
            mentions = parsed.get("mentions")
            if isinstance(mentions, list) and any(
                isinstance(item, str) and "bot" in item.lower() for item in mentions
            ):
                return True
    except Exception:
        pass

    return False


async def _fetch_group_messages(
    group_id: str,
    start_ts_ms: int,
    limit: int,
) -> tuple[list[QuickSearchResult], bool]:
    """读取群聊消息窗口"""
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(ConversationMessage, LarkUser.name.label("username"))
            .outerjoin(LarkUser, ConversationMessage.user_id == LarkUser.union_id)
            .where(ConversationMessage.chat_id == group_id)
            .where(ConversationMessage.chat_type == "group")
            .where(ConversationMessage.create_time >= start_ts_ms)
            .order_by(ConversationMessage.create_time.asc())
            .limit(limit)
        )
        rows = result.all()

    messages: list[QuickSearchResult] = []
    has_mention = False

    for msg, username in rows:
        # 仅纳入真人消息
        if str(msg.role) != "user":
            continue

        content_str = str(msg.content)
        if _contains_bot_mention(content_str):
            has_mention = True

        messages.append(
            QuickSearchResult(
                message_id=str(msg.message_id),
                content=content_str,
                user_id=str(msg.user_id),
                create_time=datetime.fromtimestamp(msg.create_time / 1000),
                role=str(msg.role),
                username=username,
                chat_type=str(msg.chat_type),
                chat_name=None,
                reply_message_id=str(msg.reply_message_id)
                if msg.reply_message_id
                else None,
            )
        )

    return messages, has_mention


async def evolve_group_profile(
    group_id: str,
    start_ts_ms: int,
    *,
    force: bool = False,
) -> ProfileUpdateResult:
    """
    针对单个群聊执行画像更新
    """

    window_start = datetime.fromtimestamp(start_ts_ms / 1000)
    window_end = datetime.now()
    limit = settings.l3_profile_message_limit

    messages, has_mention = await _fetch_group_messages(
        group_id, start_ts_ms, limit
    )

    message_count = len(messages)
    if not messages:
        return ProfileUpdateResult(
            group_id=group_id,
            updated=False,
            message_count=0,
            has_bot_mention=False,
            reason="no_messages",
            window_start=window_start,
            window_end=window_end,
        )

    meets_threshold = (
        message_count >= settings.l3_profile_min_messages or has_mention
    )
    if not meets_threshold and not force:
        return ProfileUpdateResult(
            group_id=group_id,
            updated=False,
            message_count=message_count,
            has_bot_mention=has_mention,
            reason="threshold_not_met",
            window_start=window_start,
            window_end=window_end,
        )

    formatted_messages = format_messages_to_strings(messages)
    payload = {
        "group_id": group_id,
        "window_start": window_start.isoformat(),
        "window_end": window_end.isoformat(),
        "messages": formatted_messages,
    }

    agent = ChatAgent(
        PROFILE_PROMPT_ID,
        PROFILE_TOOLS,
        model_id="gemini-2.5-flash-preview-09-2025",
    )
    response = await agent.run(
        [HumanMessage(content=json.dumps(payload, ensure_ascii=False))]
    )

    agent_text = response.content if response.content else None
    logger.info(
        "画像更新完成 group=%s count=%s mention=%s",
        group_id,
        message_count,
        has_mention,
    )

    return ProfileUpdateResult(
        group_id=group_id,
        updated=True,
        message_count=message_count,
        has_bot_mention=has_mention,
        agent_summary=agent_text,
        window_start=window_start,
        window_end=window_end,
    )


# ==================== Redis 辅助 ====================


async def record_profile_window_start(chat_id: str, first_ts_ms: int) -> None:
    """记录群聊的最早消息时间，SETNX 保证只记录首条"""
    redis = AsyncRedisClient.get_instance()
    key = _profile_key(chat_id)
    ttl_seconds = settings.l3_profile_force_after_hours * 3600 * 2
    await redis.set(key, str(first_ts_ms), nx=True, ex=ttl_seconds)


async def clear_profile_window(chat_id: str) -> None:
    """画像更新完成后删除窗口标记"""
    redis = AsyncRedisClient.get_instance()
    await redis.delete(_profile_key(chat_id))
