"""
用户画像和群聊画像服务
提供画像的CRUD操作，支持增量合并更新
"""

import logging
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from app.orm.base import AsyncSessionLocal
from app.orm.models import GroupProfile, UserProfile

logger = logging.getLogger(__name__)


def _deep_merge(base: dict[str, Any], updates: dict[str, Any]) -> dict[str, Any]:
    """
    深度合并两个字典，updates中的值会覆盖base中的值
    对于嵌套字典，会递归合并而非直接覆盖
    """
    result = base.copy()
    for key, value in updates.items():
        if (
            key in result
            and isinstance(result[key], dict)
            and isinstance(value, dict)
        ):
            result[key] = _deep_merge(result[key], value)
        else:
            result[key] = value
    return result


# ==================== 用户画像操作 ====================


async def get_user_profile(user_id: str) -> dict[str, Any] | None:
    """
    获取单个用户的画像数据

    Args:
        user_id: 用户ID

    Returns:
        画像数据字典，如果不存在返回None
    """
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(UserProfile).where(UserProfile.user_id == user_id)
        )
        profile = result.scalar_one_or_none()
        if profile:
            return profile.profile_data
        return None


async def batch_get_user_profiles(
    user_ids: list[str],
) -> dict[str, dict[str, Any]]:
    """
    批量获取用户画像

    Args:
        user_ids: 用户ID列表

    Returns:
        用户ID到画像数据的映射字典
    """
    if not user_ids:
        return {}

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(UserProfile).where(UserProfile.user_id.in_(user_ids))
        )
        profiles = result.scalars().all()

        return {profile.user_id: profile.profile_data for profile in profiles}


async def update_user_profile(
    user_id: str, updates: dict[str, Any], merge: bool = True
) -> bool:
    """
    更新用户画像

    Args:
        user_id: 用户ID
        updates: 要更新的画像数据
        merge: 是否合并更新（True则增量合并，False则完全覆盖）

    Returns:
        是否更新成功
    """
    try:
        async with AsyncSessionLocal() as session:
            # 查询现有画像
            result = await session.execute(
                select(UserProfile).where(UserProfile.user_id == user_id)
            )
            existing = result.scalar_one_or_none()

            now = datetime.now()

            if existing:
                # 更新现有画像
                if merge:
                    new_data = _deep_merge(existing.profile_data, updates)
                else:
                    new_data = updates

                existing.profile_data = new_data
                existing.version += 1
                existing.updated_at = now
            else:
                # 创建新画像
                new_profile = UserProfile(
                    user_id=user_id,
                    profile_data=updates,
                    version=1,
                    created_at=now,
                    updated_at=now,
                )
                session.add(new_profile)

            await session.commit()
            logger.info(f"用户画像更新成功: {user_id}")
            return True

    except Exception as e:
        logger.error(f"用户画像更新失败 {user_id}: {str(e)}")
        return False


async def batch_update_user_profiles(
    updates: list[dict[str, Any]], merge: bool = True
) -> dict[str, bool]:
    """
    批量更新用户画像

    Args:
        updates: 更新列表，每项包含 user_id 和 profile_data
        merge: 是否合并更新

    Returns:
        用户ID到更新结果的映射
    """
    results = {}
    for update in updates:
        user_id = update.get("user_id")
        profile_data = update.get("profile_data", {})
        if user_id:
            success = await update_user_profile(user_id, profile_data, merge)
            results[user_id] = success
    return results


# ==================== 群聊画像操作 ====================


async def get_group_profile(chat_id: str) -> dict[str, Any] | None:
    """
    获取群聊画像数据

    Args:
        chat_id: 群聊ID

    Returns:
        画像数据字典，如果不存在返回None
    """
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(GroupProfile).where(GroupProfile.chat_id == chat_id)
        )
        profile = result.scalar_one_or_none()
        if profile:
            return profile.profile_data
        return None


async def update_group_profile(
    chat_id: str, updates: dict[str, Any], merge: bool = True
) -> bool:
    """
    更新群聊画像

    Args:
        chat_id: 群聊ID
        updates: 要更新的画像数据
        merge: 是否合并更新（True则增量合并，False则完全覆盖）

    Returns:
        是否更新成功
    """
    try:
        async with AsyncSessionLocal() as session:
            # 查询现有画像
            result = await session.execute(
                select(GroupProfile).where(GroupProfile.chat_id == chat_id)
            )
            existing = result.scalar_one_or_none()

            now = datetime.now()

            if existing:
                # 更新现有画像
                if merge:
                    new_data = _deep_merge(existing.profile_data, updates)
                else:
                    new_data = updates

                existing.profile_data = new_data
                existing.version += 1
                existing.updated_at = now
            else:
                # 创建新画像
                new_profile = GroupProfile(
                    chat_id=chat_id,
                    profile_data=updates,
                    version=1,
                    created_at=now,
                    updated_at=now,
                )
                session.add(new_profile)

            await session.commit()
            logger.info(f"群聊画像更新成功: {chat_id}")
            return True

    except Exception as e:
        logger.error(f"群聊画像更新失败 {chat_id}: {str(e)}")
        return False


# ==================== 辅助函数 ====================


async def get_all_user_ids_from_profiles() -> list[str]:
    """获取所有有画像的用户ID列表"""
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(UserProfile.user_id))
        return [row[0] for row in result.all()]


async def get_all_chat_ids_from_profiles() -> list[str]:
    """获取所有有画像的群聊ID列表"""
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(GroupProfile.chat_id))
        return [row[0] for row in result.all()]
