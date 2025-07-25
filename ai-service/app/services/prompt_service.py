import logging
from typing import Optional
from sqlalchemy import select

from app.orm.models import Prompt
from app.orm.base import AsyncSessionLocal
from app.utils.decorators.cache_decorator import redis_cache

logger = logging.getLogger(__name__)


class PromptService:
    """提示词服务，使用Redis缓存"""
    
    @staticmethod
    @redis_cache(expire_seconds=10)
    async def get_prompt(prompt_id: str) -> Optional[str]:
        """
        获取指定ID的提示词
        
        Args:
            prompt_id: 提示词ID，如 "main", "bangumi"
            
        Returns:
            提示词内容，如果未找到则返回None
        """
        try:
            async with AsyncSessionLocal() as session:
                result = await session.execute(
                    select(Prompt).where(Prompt.id == prompt_id)
                )
                prompt = result.scalar_one_or_none()
                
                if prompt:
                    return prompt.content
                else:
                    logger.warning(f"未找到提示词: {prompt_id}")
                    return None
                    
        except Exception as e:
            logger.error(f"获取提示词失败 {prompt_id}: {str(e)}")
            return None
