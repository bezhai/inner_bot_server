from .models import FormatedMessage, AIModel, ModelProvider
from .base import AsyncSessionLocal
from sqlalchemy.future import select
from sqlalchemy.dialects.postgresql import insert


async def create_formated_message(data: dict):
    async with AsyncSessionLocal() as session:
        # 使用 PostgreSQL 的 INSERT ... ON CONFLICT DO UPDATE
        stmt = insert(FormatedMessage).values(**data)
        stmt = stmt.on_conflict_do_update(
            index_elements=["message_id"], set_=data  # 使用列名而不是约束名
        )
        try:
            await session.execute(stmt)
            await session.commit()
        except Exception as e:
            await session.rollback()
            raise e


async def get_formated_message_by_message_id(message_id: str):
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(FormatedMessage).where(FormatedMessage.message_id == message_id)
        )
        return result.scalar_one_or_none()


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
