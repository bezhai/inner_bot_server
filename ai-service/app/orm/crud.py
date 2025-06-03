from .models import FormatedMessage
from .base import AsyncSessionLocal
from sqlalchemy.future import select

async def create_formated_message(data: dict):
    async with AsyncSessionLocal() as session:
        obj = FormatedMessage(**data)
        session.add(obj)
        try:
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