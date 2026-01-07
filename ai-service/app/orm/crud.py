from datetime import datetime, timedelta

from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.future import select

from .base import AsyncSessionLocal
from .models import (
    ConversationMessage,
    GroupProfile,
    LarkBaseChatInfo,
    ModelMapping,
    ModelProvider,
    TopicMemory,
    UserProfile,
)


def parse_model_id(model_id: str) -> tuple[str, str]:
    """
    解析model_id格式："{供应商名称}:模型原名"

    Args:
        model_id: 格式为"供应商名称:模型原名"的字符串

    Returns:
        tuple: (供应商名称, 模型原名)
    """
    if ":" in model_id:
        provider_name, model_name = model_id.split(":", 1)
        return provider_name.strip(), model_name.strip()
    else:
        # 如果没有/，使用默认供应商302.ai
        return "302.ai", model_id.strip()


async def get_model_and_provider_info(model_id: str):
    """
    根据model_id获取供应商配置和模型名称
    优先查找 ModelMapping，如果未找到则回退到解析逻辑

    Args:
        model_id: 映射别名 或 格式为"供应商名称/模型原名"的字符串

    Returns:
        dict: 包含模型和供应商信息的字典
    """
    async with AsyncSessionLocal() as session:
        # 1. 尝试查找映射
        mapping_result = await session.execute(
            select(ModelMapping).where(ModelMapping.alias == model_id)
        )
        mapping = mapping_result.scalar_one_or_none()

        if mapping:
            provider_name = mapping.provider_name
            actual_model_name = mapping.real_model_name
        else:
            # 2. 回退到解析逻辑
            provider_name, actual_model_name = parse_model_id(model_id)

        # 3. 查询供应商信息
        provider_result = await session.execute(
            select(ModelProvider).where(ModelProvider.name == provider_name)
        )
        provider = provider_result.scalar_one_or_none()

        # 如果找不到指定供应商，尝试使用默认的302.ai
        if not provider:
            provider_result = await session.execute(
                select(ModelProvider).where(ModelProvider.name == "302.ai")
            )
            provider = provider_result.scalar_one_or_none()

        if not provider:
            return None

        return {
            "model_name": actual_model_name,
            "api_key": provider.api_key,
            "base_url": provider.base_url,
            "is_active": provider.is_active,
            "client_type": provider.client_type or "openai",
        }


async def create_conversation_message(
    message_id: str,
    user_id: str,
    content: str,
    role: str,
    root_message_id: str,
    chat_id: str,
    chat_type: str,
    create_time: int,
    reply_message_id: str | None = None,
) -> ConversationMessage:
    async with AsyncSessionLocal() as session:
        message = ConversationMessage(
            message_id=message_id,
            user_id=user_id,
            content=content,
            role=role,
            root_message_id=root_message_id,
            reply_message_id=reply_message_id,
            chat_id=chat_id,
            chat_type=chat_type,
            create_time=create_time,
        )
        message = await session.merge(message)
        await session.commit()
        await session.refresh(message)
        return message


# =========================
# TopicMemory CRUD (L2)
# =========================


async def get_topics_by_group(
    group_id: str, *, hours: int | None = None, limit: int | None = None
) -> list[TopicMemory]:
    """
    获取群组的话题记录

    Args:
        group_id: 群组ID
        hours: 可选，限制返回最近多少小时内的话题（基于updated_at字段）
        limit: 可选，限制返回记录的数量
    """
    async with AsyncSessionLocal() as session:
        query = select(TopicMemory).where(TopicMemory.group_id == group_id)

        # 添加时间过滤
        if hours is not None:
            cutoff = datetime.now() - timedelta(hours=hours)
            query = query.where(TopicMemory.updated_at >= cutoff)

        # 添加数量限制
        if limit is not None:
            query = query.limit(limit)

        result = await session.execute(query)
        return list(result.scalars().all())


async def upsert_topic(
    *,
    topic_id: int | None,
    group_id: str,
    title: str,
    summary: str,
) -> TopicMemory:
    """
    根据topic_id执行upsert
    """
    async with AsyncSessionLocal() as session:
        # 创建要保存的对象
        topic = TopicMemory(
            id=topic_id,
            group_id=group_id,
            title=title,
            summary=summary,
        )

        # 使用merge进行upsert操作
        topic = await session.merge(topic)
        await session.commit()
        return topic


# =========================
# Profile CRUD
# =========================


async def fetch_user_profiles(user_ids: list[str]) -> dict[str, str | None]:
    """批量获取用户画像"""
    if not user_ids:
        return {}

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(UserProfile).where(UserProfile.user_id.in_(user_ids))
        )
        return {profile.user_id: profile.profile for profile in result.scalars()}


async def upsert_user_profiles(
    updates: list[tuple[str, str | None]],
) -> None:
    """批量更新/创建用户画像"""
    if not updates:
        return

    values_list = [{"user_id": uid, "profile": profile} for uid, profile in updates]
    async with AsyncSessionLocal.begin() as session:
        stmt = insert(UserProfile).values(values_list)
        stmt = stmt.on_conflict_do_update(
            index_elements=["user_id"],
            set_={
                "profile": stmt.excluded.profile,
                "updated_at": func.now(),
            },
        )
        await session.execute(stmt)


async def fetch_group_profile(chat_id: str) -> str | None:
    """获取单个群聊画像"""
    async with AsyncSessionLocal() as session:
        profile = await session.get(GroupProfile, chat_id)
        return profile.profile if profile else None


async def upsert_group_profile(chat_id: str, profile: str | None) -> None:
    """更新/创建群聊画像"""

    async with AsyncSessionLocal.begin() as session:
        stmt = insert(GroupProfile).values(chat_id=chat_id, profile=profile)

        stmt = stmt.on_conflict_do_update(
            index_elements=["chat_id"],
            set_={
                "profile": stmt.excluded.profile,
                "updated_at": func.now(),
            },
        )

        await session.execute(stmt)


async def get_gray_config(message_id: str) -> dict | None:
    """
    根据 message_id 关联查询所属 chat 的灰度配置
    """
    async with AsyncSessionLocal() as session:
        # 使用 Join 避免 N+1 查询
        stmt = (
            select(LarkBaseChatInfo.gray_config)
            .join(
                ConversationMessage,
                ConversationMessage.chat_id == LarkBaseChatInfo.chat_id,
            )
            .where(ConversationMessage.message_id == message_id)
        )
        # 直接返回配置字段 (dict) 或者 None
        return await session.scalar(stmt)
