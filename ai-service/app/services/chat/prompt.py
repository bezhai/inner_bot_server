import logging
from datetime import datetime
from typing import TypedDict

from jinja2 import Template

from app.services.prompt_service import PromptService as DBPromptService

logger = logging.getLogger(__name__)


class PromptGeneratorParam(TypedDict):
    pass


class ChatPromptService:
    @staticmethod
    async def get_prompt(param: PromptGeneratorParam) -> str:
        """从数据库获取主提示词"""
        prompt_content = await DBPromptService.get_prompt("main")

        if not prompt_content:
            raise ValueError("未找到主提示词(id='main')")

        template = Template(prompt_content)
        return template.render(
            {
                "currDate": datetime.now().strftime("%Y-%m-%d"),
                "currTime": datetime.now().strftime("%H:%M:%S"),
                **param,
            }
        )

    @staticmethod
    async def get_bangumi_prompt() -> str:
        """从数据库获取番剧提示词"""
        prompt_content = await DBPromptService.get_prompt("bangumi")

        if not prompt_content:
            raise ValueError("未找到番剧提示词(id='bangumi')")

        template = Template(prompt_content)
        return template.render(
            {
                "currDate": datetime.now().strftime("%Y-%m-%d"),
                "currTime": datetime.now().strftime("%H:%M:%S"),
            }
        )
