"""
LangGraph 模型服务适配器
"""

import logging
from collections.abc import AsyncGenerator
from typing import Any

from openai.types.chat.chat_completion import Choice

from app.services.chat.model import ModelService
from app.services.chat.prompt import PromptGeneratorParam

logger = logging.getLogger(__name__)


class LangGraphModelService:
    """
    LangGraph 模型服务适配器
    复用现有的 ModelService 实现
    """

    def __init__(self):
        self.model_service = ModelService()

    async def stream_chat_completion(
        self,
        model_id: str,
        messages: list[dict[str, Any]],
        temperature: float = 0.7,
        tools: list[dict[str, Any]] | None = None,
        tool_choice: str | None = "auto",
        max_tool_iterations: int = 10,
        **kwargs,
    ) -> AsyncGenerator[Choice, None]:
        """
        流式聊天完成，适配 LangGraph 使用

        Args:
            model_id: 模型ID
            messages: 消息列表
            temperature: 温度参数
            tools: 工具列表
            tool_choice: 工具选择
            max_tool_iterations: 最大工具迭代次数
            **kwargs: 其他参数

        Yields:
            Choice: OpenAI 响应选择
        """
        # 创建临时的消息上下文
        temp_context = TempMessageContext(messages)

        # 调用现有的模型服务
        async for choice in self.model_service.chat_completion_stream(
            model_id=model_id,
            context=temp_context,
            temperature=temperature,
            tools=tools,
            tool_choice=tool_choice,
            max_tool_iterations=max_tool_iterations,
            **kwargs,
        ):
            yield choice


class TempMessageContext:
    """
    临时消息上下文，用于适配现有的 ModelService
    """

    def __init__(self, messages: list[dict[str, Any]]):
        self.messages = messages
        self.temp_messages = []

    def build(self, param: PromptGeneratorParam | None = None) -> list[dict[str, Any]]:
        """
        构建消息列表

        Args:
            param: 提示词参数（兼容现有接口）

        Returns:
            消息列表
        """
        return self.messages + self.temp_messages

    def append_message(self, message: dict[str, Any]) -> None:
        """
        添加临时消息

        Args:
            message: 消息内容
        """
        self.temp_messages.append(message)

    def get_messages(self) -> list[dict[str, Any]]:
        """
        获取所有消息

        Returns:
            消息列表
        """
        return self.messages + self.temp_messages
