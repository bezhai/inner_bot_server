"""
L3画像 orchestrator

基于 LangChain Tool & PG 的用户/群聊画像维护
"""

import logging
from dataclasses import dataclass
from datetime import datetime

from langchain.messages import HumanMessage
from sqlalchemy import select

from app.agents.basic import ChatAgent
from app.agents.basic.context import ContextSchema
from app.agents.memory.tools import PROFILE_TOOLS
from app.orm.base import AsyncSessionLocal
from app.orm.models import ConversationMessage, LarkUser
from app.services.quick_search import QuickSearchResult
from app.utils.message_formatter import format_messages_to_strings

logger = logging.getLogger(__name__)

PROFILE_PROMPT_ID = "memory_profile_update"


@dataclass
class ProfileUpdateResult:
    group_id: str
    updated: bool
    message_count: int
    reason: str | None = None
    agent_summary: str | None = None
    window_start: datetime | None = None
    window_end: datetime | None = None


async def _fetch_group_messages(
    group_id: str,
    start_ts_ms: int,
    end_ts_ms: int | None,
) -> list[QuickSearchResult]:
    if not end_ts_ms:
        end_ts_ms = int(datetime.now().timestamp() * 1000)

    """读取群聊消息窗口"""
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(ConversationMessage, LarkUser.name.label("username"))
            .outerjoin(LarkUser, ConversationMessage.user_id == LarkUser.union_id)
            .where(ConversationMessage.chat_id == group_id)
            .where(ConversationMessage.chat_type == "group")
            .where(ConversationMessage.create_time >= start_ts_ms)
            .where(ConversationMessage.create_time <= end_ts_ms)
            .order_by(ConversationMessage.create_time.asc())
        )
        rows = result.all()

    messages: list[QuickSearchResult] = []

    for msg, username in rows:
        messages.append(
            QuickSearchResult(
                message_id=str(msg.message_id),
                content=str(msg.content),
                user_id=str(msg.user_id),
                create_time=datetime.fromtimestamp(msg.create_time / 1000),
                role=str(msg.role),
                username=username,
                chat_type=str(msg.chat_type),
                chat_name=None,
                reply_message_id=(
                    str(msg.reply_message_id) if msg.reply_message_id else None
                ),
            )
        )

    return messages


def chunk_data(data, size):
    """
    将 data 按照 size 分块。
    使用生成器 (yield) 以节省内存。
    """
    for i in range(0, len(data), size):
        yield data[i : i + size]


async def evolve_group_profile(
    group_id: str,
    start_ts_ms: int,
    end_ts_ms: int | None = None,
    split_cnt: int | None = None,
) -> ProfileUpdateResult:
    """
    针对单个群聊执行画像更新
    """

    messages = await _fetch_group_messages(group_id, start_ts_ms, end_ts_ms)

    if len(messages) == 0:
        return ProfileUpdateResult(
            group_id=group_id,
            updated=False,
            message_count=0,
            reason="no_messages",
        )

    for msg_chunk in chunk_data(messages, split_cnt or 100):
        formatted_messages, user_id_map = format_messages_to_strings(msg_chunk)

        agent = ChatAgent(
            PROFILE_PROMPT_ID,
            PROFILE_TOOLS,
            model_id="gpt-5-mini",
        )
        await agent.run(
            [HumanMessage(content="\n".join(formatted_messages))],
            context=ContextSchema(
                curr_chat_id=group_id,
                user_id_map=user_id_map,
            ),
        )

    return ProfileUpdateResult(
        group_id=group_id,
        updated=True,
        message_count=len(messages),
    )


async def fetch_active_chat_ids(minutes: int = 30) -> list[str]:
    # 1. 计算起始时间戳 (毫秒)
    now_ts = datetime.now().timestamp()
    start_ts_ms = int((now_ts - (minutes * 60)) * 1000)

    """获取最近 N 分钟内活跃的所有 chat_id"""
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(ConversationMessage.chat_id)
            .where(ConversationMessage.create_time >= start_ts_ms)
            .where(ConversationMessage.chat_type == "group")
            .distinct()
        )
        rows = result.scalars().all()

    return list(rows)
