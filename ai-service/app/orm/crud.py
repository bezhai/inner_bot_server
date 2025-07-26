from sqlalchemy.future import select

from .base import AsyncSessionLocal
from .models import AIModel, ModelProvider


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
