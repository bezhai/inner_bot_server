"""
画像维护工具集合

供 L3 画像 Agent 通过 LangChain tool 访问数据库。
"""

import json
import logging
from typing import Annotated, Any

from langchain.tools import tool
from pydantic import Field

from app.orm import crud

logger = logging.getLogger(__name__)


def _safe_json(data: Any) -> str:
    """将数据转换为 JSON 字符串，便于模型阅读"""
    return json.dumps(data, ensure_ascii=False, default=str)


@tool
async def batch_get_user_profiles(
    user_ids: Annotated[
        list[str],
        Field(description="需要查询画像的 user_id 列表，每个用户只出现一次"),
    ]
) -> str:
    """
    批量读取用户画像
    """

    # 去重并过滤空值
    unique_ids = sorted({uid for uid in user_ids if uid})
    profiles = await crud.fetch_user_profiles(unique_ids)
    return _safe_json(profiles)


@tool
async def batch_upsert_user_profiles(
    updates: Annotated[
        list[dict[str, Any]],
        Field(
            description="要更新的用户画像列表，每项包含 user_id 与 profile 字段，"
            "profile 应为结构化 JSON"
        ),
    ]
) -> str:
    """
    批量更新/创建用户画像
    """

    normalized: list[tuple[str, dict[str, Any] | None]] = []
    for item in updates:
        user_id = item.get("user_id")
        profile = item.get("profile")
        if not user_id:
            continue
        normalized.append((user_id, profile))

    await crud.upsert_user_profiles(normalized)
    logger.info("更新用户画像: %s", [u[0] for u in normalized])
    return f"updated_users={len(normalized)}"


@tool
async def get_group_profile(
    chat_id: Annotated[str, Field(description="群聊 chat_id")]
) -> str:
    """
    读取单个群聊画像
    """

    profile = await crud.fetch_group_profile(chat_id)
    return _safe_json(profile or {})


@tool
async def upsert_group_profile(
    chat_id: Annotated[str, Field(description="群聊 chat_id")],
    profile: Annotated[
        dict[str, Any],
        Field(description="要写入的群聊画像 JSON（完整覆盖写入）"),
    ],
) -> str:
    """
    更新/创建群聊画像
    """

    await crud.upsert_group_profile(chat_id, profile)
    logger.info("更新群聊画像: %s", chat_id)
    return "group_profile_updated"


PROFILE_TOOLS = [
    batch_get_user_profiles,
    batch_upsert_user_profiles,
    get_group_profile,
    upsert_group_profile,
]
