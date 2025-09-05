import logging

from sqlalchemy import select

from app.orm.base import AsyncSessionLocal
from app.orm.models import Prompt
from app.utils.decorators.cache_decorator import redis_cache

logger = logging.getLogger(__name__)


class PromptService:
    """提示词服务，使用Redis缓存"""

    @staticmethod
    @redis_cache(expire_seconds=10)
    async def _get_prompt(prompt_id: str) -> str | None:
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
                prompt: Prompt | None = result.scalar_one_or_none()

                if prompt is not None and getattr(prompt, "content", None) is not None:
                    return str(prompt.content)
                else:
                    logger.warning(f"未找到提示词: {prompt_id}")
                    return None

        except Exception as e:
            logger.error(f"获取提示词失败 {prompt_id}: {str(e)}")
            return None

    @staticmethod
    async def get_prompt(prompt_id: str, **kwargs) -> str:
        """从数据库获取指定ID的提示词"""
        prompt_content = await PromptService._get_prompt(prompt_id)
        if not prompt_content:
            raise ValueError(f"未找到提示词(id='{prompt_id}')")

        from datetime import datetime

        from jinja2 import Template

        template = Template(prompt_content)
        return template.render(
            {
                "currDate": datetime.now().strftime("%Y-%m-%d"),
                "currTime": datetime.now().strftime("%H:%M:%S"),
                **kwargs,
            }
        )
