"""
画像更新工具集
提供给LLM调用的工具，用于读取和更新用户/群聊画像
"""

import json
import logging
from typing import Any

from langchain.tools import tool

from app.memory.profile_service import (
    batch_get_user_profiles,
    batch_update_user_profiles,
    get_group_profile,
    update_group_profile,
)

logger = logging.getLogger(__name__)


@tool
async def read_user_profiles(user_ids: list[str]) -> str:
    """
    批量读取用户画像信息

    根据用户ID列表获取对应的用户画像数据。画像包含用户的长期稳固信息，
    如性别、年龄段、职业、性格特点、兴趣爱好、与其他用户的关系等。

    Args:
        user_ids: 用户ID列表，例如 ["user_123", "user_456"]

    Returns:
        JSON格式的用户画像数据，键为用户ID，值为画像内容。
        如果用户没有画像记录，则不会出现在返回结果中。
    """
    try:
        profiles = await batch_get_user_profiles(user_ids)
        if not profiles:
            return json.dumps(
                {"message": "未找到任何用户画像", "profiles": {}}, ensure_ascii=False
            )
        return json.dumps(
            {"message": f"找到 {len(profiles)} 个用户画像", "profiles": profiles},
            ensure_ascii=False,
        )
    except Exception as e:
        logger.error(f"读取用户画像失败: {str(e)}")
        return json.dumps({"error": f"读取失败: {str(e)}"}, ensure_ascii=False)


@tool
async def update_user_profiles(updates: list[dict[str, Any]]) -> str:
    """
    批量更新用户画像

    更新一个或多个用户的画像信息。更新采用增量合并方式，
    即只更新传入的字段，不会删除原有的其他字段。

    画像应包含长期稳固的用户信息，例如：
    - gender: 性别 (男/女/未知)
    - age_range: 年龄段 (如 "20-30")
    - occupation: 职业
    - personality: 性格总结
    - interests: 兴趣爱好列表
    - relationships: 与其他用户的关系 (字典，key为user_id，value为关系描述)
    - other_facts: 其他长期事实列表

    注意：不要存储临时性信息（如"今天吃了什么"、"下周要去旅游"等）

    Args:
        updates: 更新列表，每项包含:
            - user_id: 用户ID (必需)
            - profile_data: 要更新的画像数据 (字典格式)

        示例:
        [
            {
                "user_id": "user_123",
                "profile_data": {
                    "gender": "男",
                    "occupation": "程序员",
                    "personality": "性格开朗，喜欢技术讨论"
                }
            }
        ]

    Returns:
        更新结果，包含每个用户的更新状态
    """
    try:
        if not updates:
            return json.dumps({"message": "没有需要更新的内容"}, ensure_ascii=False)

        results = await batch_update_user_profiles(updates, merge=True)
        success_count = sum(1 for v in results.values() if v)
        return json.dumps(
            {
                "message": f"更新完成，成功 {success_count}/{len(updates)} 个",
                "results": results,
            },
            ensure_ascii=False,
        )
    except Exception as e:
        logger.error(f"更新用户画像失败: {str(e)}")
        return json.dumps({"error": f"更新失败: {str(e)}"}, ensure_ascii=False)


@tool
async def read_group_profile(chat_id: str) -> str:
    """
    读取群聊画像信息

    获取指定群聊的画像数据。画像包含群聊的长期特征，
    如群聊风格、常见话题、群文化、成员互动特点等。

    Args:
        chat_id: 群聊ID

    Returns:
        JSON格式的群聊画像数据。如果没有画像记录，返回空对象。
    """
    try:
        profile = await get_group_profile(chat_id)
        if not profile:
            return json.dumps(
                {"message": "该群聊暂无画像记录", "profile": {}}, ensure_ascii=False
            )
        return json.dumps(
            {"message": "获取群聊画像成功", "profile": profile}, ensure_ascii=False
        )
    except Exception as e:
        logger.error(f"读取群聊画像失败: {str(e)}")
        return json.dumps({"error": f"读取失败: {str(e)}"}, ensure_ascii=False)


@tool
async def update_group_profile_tool(chat_id: str, updates: dict[str, Any]) -> str:
    """
    更新群聊画像

    更新指定群聊的画像信息。更新采用增量合并方式，
    即只更新传入的字段，不会删除原有的其他字段。

    画像应包含群聊的长期特征，例如：
    - group_style: 群聊风格 (如 "技术讨论为主，氛围轻松")
    - common_topics: 常见话题列表
    - group_culture: 群文化特点 (如固定的梗、习惯用语等)
    - member_dynamics: 成员互动特点
    - other_facts: 其他长期事实列表

    注意：不要存储临时性信息

    Args:
        chat_id: 群聊ID
        updates: 要更新的画像数据 (字典格式)

        示例:
        {
            "group_style": "二次元讨论群，成员活跃度高",
            "common_topics": ["动漫", "游戏", "轻小说"],
            "group_culture": "喜欢用表情包，有'草'等口头禅"
        }

    Returns:
        更新结果
    """
    try:
        if not updates:
            return json.dumps({"message": "没有需要更新的内容"}, ensure_ascii=False)

        success = await update_group_profile(chat_id, updates, merge=True)
        if success:
            return json.dumps(
                {"message": "群聊画像更新成功", "chat_id": chat_id}, ensure_ascii=False
            )
        else:
            return json.dumps(
                {"message": "群聊画像更新失败", "chat_id": chat_id}, ensure_ascii=False
            )
    except Exception as e:
        logger.error(f"更新群聊画像失败: {str(e)}")
        return json.dumps({"error": f"更新失败: {str(e)}"}, ensure_ascii=False)


# 工具列表，供Agent使用
PROFILE_TOOLS = [
    read_user_profiles,
    update_user_profiles,
    read_group_profile,
    update_group_profile_tool,
]
