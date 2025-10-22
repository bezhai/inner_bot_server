"""上下文构建模块

负责构建聊天上下文，包括历史消息获取、格式化和结构化。
"""

import logging
from dataclasses import dataclass

from app.services.quick_search import QuickSearchResult, quick_search

logger = logging.getLogger(__name__)


@dataclass
class ChatContext:
    """聊天上下文数据类

    Attributes:
        chat_history: 格式化的聊天历史
        trigger_content: 触发消息的格式化内容
        trigger_username: 触发用户的用户名
        chat_type: 聊天类型（p2p/group）
        chat_name: 群聊名称（私聊时为None）
        image_urls: 图片URL列表
    """

    chat_history: str
    trigger_content: str
    trigger_username: str
    chat_type: str
    chat_name: str | None
    image_urls: list[str]


def _format_chat_message(msg: QuickSearchResult) -> str:
    """格式化单条聊天消息

    Args:
        msg: 消息对象

    Returns:
        格式化后的消息字符串
    """
    time_str = msg.create_time.strftime("%Y-%m-%d %H:%M:%S")
    username = msg.username or "未知用户"

    return f"[{time_str}] [User: {username}]: {msg.content}"


def _build_context_from_messages(
    messages: list[QuickSearchResult], trigger_id: str
) -> ChatContext:
    """从消息列表构建聊天上下文

    Args:
        messages: 消息列表
        trigger_id: 触发消息的ID

    Returns:
        ChatContext对象
    """
    history_messages = []
    trigger_msg = None
    trigger_username = "未知用户"
    chat_type = "p2p"  # 默认私聊
    chat_name = None

    for msg in messages:
        if msg.message_id == trigger_id:
            trigger_msg = msg
            trigger_username = msg.username or "未知用户"
            chat_type = msg.chat_type or "p2p"
            chat_name = msg.chat_name
        else:
            history_messages.append(_format_chat_message(msg))

    chat_history = (
        "\n".join(history_messages) if history_messages else "（暂无历史记录）"
    )
    trigger_formatted = (
        _format_chat_message(trigger_msg) if trigger_msg else "（未找到触发消息）"
    )

    # TODO: 从消息中提取图片URL
    image_urls: list[str] = []

    return ChatContext(
        chat_history=chat_history,
        trigger_content=trigger_formatted,
        trigger_username=trigger_username,
        chat_type=chat_type,
        chat_name=chat_name,
        image_urls=image_urls,
    )


async def build_chat_context(message_id: str, limit: int = 10) -> ChatContext | None:
    """构建聊天上下文

    从数据库获取历史消息并构建结构化的上下文对象。

    Args:
        message_id: 触发消息的ID
        limit: 获取的历史消息数量限制

    Returns:
        ChatContext对象，如果没有找到消息则返回None
    """
    # L1: 使用 quick_search 拉取近期历史
    l1_results = await quick_search(message_id=message_id, limit=limit)

    # 如果没有结果，返回None
    if not l1_results:
        logger.warning(f"No results found for message_id: {message_id}")
        return None

    # TODO: L2 获取活跃话题
    # group_id = l1_results[-1].chat_id
    # active_topics = await get_active_topics(group_id, hours=3)
    # if group_id else []

    # TODO: L3 获取共识
    # consensus_list = await search_relevant_consensus(group_id,
    # l1_results[-1].content, k=3) if group_id else []

    return _build_context_from_messages(l1_results, message_id)
