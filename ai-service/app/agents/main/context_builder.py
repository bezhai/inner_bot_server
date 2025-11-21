"""上下文构建模块

负责构建聊天上下文，包括历史消息获取、格式化和结构化。
"""

import asyncio
import logging
import re
from dataclasses import dataclass
from datetime import datetime

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
    """群聊上下文数据类"""

    chat_history: str
    trigger_content: str
    trigger_username: str
    chat_type: str
    chat_name: str | None
    image_urls: list[str]


@dataclass
class P2PMessage:
    """私聊消息节点"""

    message_id: str
    role: str
    username: str
    content: str
    create_time: datetime
    image_urls: list[str]


@dataclass
class P2PChatContext:
    """私聊上下文数据类"""

    chat_type: str
    chat_name: str | None
    messages: list[P2PMessage]
    image_urls: list[str]


def _build_message_id_map(messages: list[QuickSearchResult]) -> dict[str, int]:
    """构建消息ID到编号的映射

    Args:
        messages: 消息列表

    Returns:
        dict[str, int]: 消息ID到编号的映射（从1开始）
    """
    return {msg.message_id: idx + 1 for idx, msg in enumerate(messages)}


def _format_chat_message(
    msg: QuickSearchResult,
    image_counter: dict[str, int],
    message_index: int,
    message_id_map: dict[str, int],
) -> tuple[str, list[str]]:
    """格式化单条聊天消息，提取图片keys

    Args:
        msg: 消息对象
        image_counter: 图片计数器字典，包含 "count" 键
        message_index: 当前消息的编号
        message_id_map: 消息ID到编号的映射

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

    # 构建回复标注
    reply_tag = ""
    if msg.reply_message_id:
        if msg.reply_message_id in message_id_map:
            # 回复的消息在上下文中
            parent_index = message_id_map[msg.reply_message_id]
            reply_tag = f" [↪️回复消息{parent_index}]"
        else:
            # 回复的消息不在上下文中
            reply_tag = " [↪️回复(消息已不在上下文)]"

    formatted_text = f"【消息{message_index}】[{time_str}] [User: {username}]{reply_tag}: {processed_content}"
    return formatted_text, image_keys


def _extract_image_keys(content: str) -> list[str]:
    """仅提取图片 keys，不对文本做替换"""
    return re.findall(r"!\[image\]\(([^)]+)\)", content)


async def _process_image_requests(
    all_image_keys: list[tuple[str, str, str]],
) -> tuple[list[str], dict[str, list[str]]]:
    """统一处理图片，返回全量URL及按消息聚合的映射"""
    image_urls: list[str] = []
    message_image_map: dict[str, list[str]] = {}

    if not all_image_keys:
        return image_urls, message_image_map

    image_tasks = [
        image_client.process_image(key, msg_id if role == "user" else None)
        for key, msg_id, role in all_image_keys
    ]
    image_results = await asyncio.gather(*image_tasks, return_exceptions=True)

    for i, result in enumerate(image_results):
        key, msg_id, _ = all_image_keys[i]
        if isinstance(result, str) and result:
            image_urls.append(result)
            message_image_map.setdefault(msg_id, []).append(result)
        else:
            logger.warning(f"图片处理失败: key={key}, message_id={msg_id}")

    return image_urls, message_image_map


async def _build_group_context(
    messages: list[QuickSearchResult], trigger_id: str
) -> ChatContext:
    """构建群聊上下文"""
    history_messages = []
    trigger_username = "未知用户"
    trigger_formatted = "（未找到触发消息）"
    chat_type = "group"
    chat_name = None

    image_counter = {"count": 0}
    all_image_keys: list[tuple[str, str, str]] = []
    message_id_map = _build_message_id_map(messages)

    for idx, msg in enumerate(messages):
        message_index = idx + 1
        formatted_text, image_keys = _format_chat_message(
            msg, image_counter, message_index, message_id_map
        )

        for key in image_keys:
            all_image_keys.append((key, msg.message_id, msg.role))

        if msg.message_id == trigger_id:
            trigger_username = msg.username or "未知用户"
            chat_type = msg.chat_type or "group"
            chat_name = msg.chat_name
            trigger_formatted = formatted_text
        else:
            history_messages.append(formatted_text)

    chat_history = (
        "\n".join(history_messages) if history_messages else "（暂无历史记录）"
    )

    image_urls, _ = await _process_image_requests(all_image_keys)

    return ChatContext(
        chat_history=chat_history,
        trigger_content=trigger_formatted,
        trigger_username=trigger_username,
        chat_type=chat_type,
        chat_name=chat_name,
        image_urls=image_urls,
    )


async def _build_p2p_context(
    messages: list[QuickSearchResult], trigger_id: str
) -> P2PChatContext:
    """构建私聊上下文（保留多轮消息）"""
    all_image_keys: list[tuple[str, str, str]] = []

    for msg in messages:
        for key in _extract_image_keys(msg.content):
            all_image_keys.append((key, msg.message_id, msg.role))

    image_urls, message_image_map = await _process_image_requests(all_image_keys)

    chat_type = "p2p"
    chat_name = None
    p2p_messages: list[P2PMessage] = []

    for msg in messages:
        if msg.message_id == trigger_id:
            chat_type = msg.chat_type or "p2p"
            chat_name = msg.chat_name

        p2p_messages.append(
            P2PMessage(
                message_id=msg.message_id,
                role=msg.role,
                username=msg.username or "未知用户",
                content=msg.content,
                create_time=msg.create_time,
                image_urls=message_image_map.get(msg.message_id, []),
            )
        )

    return P2PChatContext(
        chat_type=chat_type,
        chat_name=chat_name,
        messages=p2p_messages,
        image_urls=image_urls,
    )


async def build_chat_context(
    message_id: str, limit: int = 10
) -> ChatContext | P2PChatContext | None:
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

    trigger_msg = next((msg for msg in l1_results if msg.message_id == message_id), None)
    chat_type = (trigger_msg.chat_type if trigger_msg else None) or "p2p"

    if chat_type == "group":
        return await _build_group_context(l1_results, message_id)

    return await _build_p2p_context(l1_results, message_id)
