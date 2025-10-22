"""上下文构建模块

负责构建聊天上下文，包括历史消息获取、格式化和结构化。
"""

import asyncio
import logging
import re
from dataclasses import dataclass

from app.clients.image_client import image_client
from app.services.quick_search import QuickSearchResult, quick_search

logger = logging.getLogger(__name__)


def _extract_and_replace_images(
    content: str, start_index: int
) -> tuple[str, list[str]]:
    """从消息内容中提取图片keys，替换为【图片N】标记

    Args:
        content: 原始消息内容
        start_index: 起始图片编号

    Returns:
        tuple[str, list[str]]: (处理后的文本, 图片keys列表)
    """
    # 提取所有图片keys
    image_keys = re.findall(r"!\[image\]\(([^)]+)\)", content)

    if not image_keys:
        return content, []

    # 逐个替换为【图片N】标记
    processed_content = content
    for i, key in enumerate(image_keys):
        img_index = start_index + i + 1
        processed_content = processed_content.replace(
            f"![image]({key})", f"【图片{img_index}】", 1
        )

    return processed_content, image_keys


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


def _format_chat_message(
    msg: QuickSearchResult, image_counter: dict[str, int]
) -> tuple[str, list[str]]:
    """格式化单条聊天消息，提取图片keys

    Args:
        msg: 消息对象
        image_counter: 图片计数器字典，包含 "count" 键

    Returns:
        tuple[str, list[str]]: (格式化后的消息字符串, 图片keys列表)
    """
    time_str = msg.create_time.strftime("%Y-%m-%d %H:%M:%S")
    username = msg.username or "未知用户"

    # 提取并替换图片标记
    processed_content, image_keys = _extract_and_replace_images(
        msg.content, image_counter["count"]
    )

    # 更新计数器
    image_counter["count"] += len(image_keys)

    formatted_text = f"[{time_str}] [User: {username}]: {processed_content}"
    return formatted_text, image_keys


async def _build_context_from_messages(
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
    trigger_formatted = "（未找到触发消息）"
    chat_type = "p2p"  # 默认私聊
    chat_name = None

    # 初始化图片计数器和收集器
    image_counter = {"count": 0}
    all_image_keys: list[tuple[str, str, str]] = []  # (key, message_id, role)

    for msg in messages:
        formatted_text, image_keys = _format_chat_message(msg, image_counter)

        # 收集图片keys及其元信息
        for key in image_keys:
            all_image_keys.append((key, msg.message_id, msg.role))

        if msg.message_id == trigger_id:
            trigger_msg = msg
            trigger_username = msg.username or "未知用户"
            chat_type = msg.chat_type or "p2p"
            chat_name = msg.chat_name
            trigger_formatted = formatted_text
        else:
            history_messages.append(formatted_text)

    chat_history = (
        "\n".join(history_messages) if history_messages else "（暂无历史记录）"
    )

    # 批量处理所有图片
    image_urls: list[str] = []
    if all_image_keys:
        # 按顺序并发处理所有图片
        image_tasks = [
            image_client.process_image(key, msg_id if role == "user" else None)
            for key, msg_id, role in all_image_keys
        ]
        image_results = await asyncio.gather(*image_tasks, return_exceptions=True)

        # 收集成功的URLs
        for i, result in enumerate(image_results):
            if isinstance(result, str) and result:
                image_urls.append(result)
            else:
                key, msg_id, _ = all_image_keys[i]
                logger.warning(f"图片处理失败: key={key}, message_id={msg_id}")

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

    return await _build_context_from_messages(l1_results, message_id)
