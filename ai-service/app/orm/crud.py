from datetime import datetime

from sqlalchemy.future import select

from .base import AsyncSessionLocal
from .models import ConversationMessage, ModelProvider


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

    Args:
        model_id: 格式为"供应商名称/模型原名"的字符串

    Returns:
        dict: 包含模型和供应商信息的字典
    """
    provider_name, actual_model_name = parse_model_id(model_id)

    async with AsyncSessionLocal() as session:
        # 直接查询供应商信息
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
        }


async def create_conversation_message(
    message_id: str,
    user_id: str,
    content: str,
    role: str,
    root_message_id: str,
    chat_id: str,
    chat_type: str,
    create_time: datetime,
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
            created_at=datetime.now(),
        )
        session.add(message)
        await session.commit()
        await session.refresh(message)
        return message
