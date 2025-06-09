from .models import FormatedMessage, AIModel, ModelProvider
from .base import AsyncSessionLocal
from sqlalchemy.future import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy import and_, desc
from typing import List, Optional, Union
from datetime import datetime
from app.types.chat import ChatMessage


def convert_db_message_to_chat_message(db_message: FormatedMessage) -> ChatMessage:
    """
    将数据库消息模型转换为ChatMessage实体

    Args:
        db_message: 数据库消息模型

    Returns:
        ChatMessage: 转换后的聊天消息实体
    """
    return ChatMessage(
        user_id=db_message.user_id,
        user_open_id=db_message.user_open_id,
        user_name=db_message.user_name,
        content=db_message.content,
        is_mention_bot=db_message.is_mention_bot,
        role=db_message.role,
        root_message_id=db_message.root_message_id,
        reply_message_id=db_message.reply_message_id,
        message_id=db_message.message_id,
        chat_id=db_message.chat_id,
        chat_type=db_message.chat_type,
        create_time=str(int(db_message.create_time.timestamp() * 1000)),
    )


def convert_db_messages_to_chat_messages(
    db_messages: List[FormatedMessage],
) -> List[ChatMessage]:
    """
    将数据库消息模型列表转换为ChatMessage实体列表

    Args:
        db_messages: 数据库消息模型列表

    Returns:
        List[ChatMessage]: 转换后的聊天消息实体列表
    """
    return [convert_db_message_to_chat_message(msg) for msg in db_messages]


async def create_formated_message(data: dict):
    async with AsyncSessionLocal() as session:
        # 使用 PostgreSQL 的 INSERT ... ON CONFLICT (column_name) 语法
        stmt = insert(FormatedMessage).values(**data)
        stmt = stmt.on_conflict_do_update(index_elements=["message_id"], set_=data)
        try:
            await session.execute(stmt)
            await session.commit()
        except Exception as e:
            await session.rollback()
            raise e


async def get_formated_message_by_message_id(message_id: str) -> Optional[ChatMessage]:
    """
    根据消息id获取消息

    Args:
        message_id: 消息ID

    Returns:
        Optional[ChatMessage]: 聊天消息实体，如果不存在则返回None
    """
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(FormatedMessage).where(FormatedMessage.message_id == message_id)
        )
        db_message = result.scalar_one_or_none()
        return convert_db_message_to_chat_message(db_message) if db_message else None


async def get_model_and_provider_info(model_id: str):
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(AIModel).where(AIModel.model_id == model_id)
        )
        model = result.scalar_one_or_none()
        if not model:
            return None
        # 查询供应商
        provider_result = await session.execute(
            select(ModelProvider).where(ModelProvider.provider_id == model.provider_id)
        )
        provider = provider_result.scalar_one_or_none()
        if not provider:
            return None
        return {
            "model_name": model.model_name or model.name,
            "api_key": provider.api_key,
            "base_url": provider.base_url,
        }


async def get_messages_by_root_id(
    root_message_id: str, exclude_current: Optional[str] = None, limit: int = 20
) -> List[ChatMessage]:
    """
    获取同一回复线程的所有消息

    Args:
        root_message_id: 根消息ID
        exclude_current: 排除的当前消息ID
        limit: 最大返回数量

    Returns:
        List[ChatMessage]: 回复线程中的消息列表
    """
    async with AsyncSessionLocal() as session:
        query = select(FormatedMessage).where(
            FormatedMessage.root_message_id == root_message_id
        )

        if exclude_current:
            query = query.where(FormatedMessage.message_id != exclude_current)

        query = query.order_by(FormatedMessage.create_time).limit(limit)

        result = await session.execute(query)
        db_messages = result.scalars().all()

        return convert_db_messages_to_chat_messages(db_messages)


async def get_recent_messages_in_chat(
    chat_id: str,
    before_time: datetime,
    limit: int = 10,
    exclude_current: Optional[str] = None,
    after_time: Optional[datetime] = None,
) -> List[ChatMessage]:
    """
    获取聊天中的最近消息

    Args:
        chat_id: 聊天ID
        before_time: 时间截止点
        limit: 最大返回数量
        exclude_current: 排除的当前消息ID
        after_time: 时间起始点（可选）

    Returns:
        List[ChatMessage]: 最近的消息列表
    """
    async with AsyncSessionLocal() as session:
        conditions = [
            FormatedMessage.chat_id == chat_id,
            FormatedMessage.create_time < before_time,
        ]

        if after_time:
            conditions.append(FormatedMessage.create_time > after_time)

        query = select(FormatedMessage).where(and_(*conditions))

        if exclude_current:
            query = query.where(FormatedMessage.message_id != exclude_current)

        query = query.order_by(desc(FormatedMessage.create_time)).limit(limit)

        result = await session.execute(query)
        db_messages = result.scalars().all()

        # 转换为 ChatMessage 对象并按时间正序排列
        chat_messages = convert_db_messages_to_chat_messages(reversed(db_messages))
        return chat_messages
