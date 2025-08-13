"""
ChatAgent - 通用聊天代理
封装聊天的核心功能，提供简洁的接口用于内部服务
"""

import asyncio
import logging
from collections.abc import AsyncGenerator, Callable
from typing import Any

from app.services.chat.context import MessageContext
from app.services.chat.message import AIChatService, ContentFilterError
from app.services.chat.prompt import PromptGeneratorParam
from app.types.chat import ChatStreamChunk

logger = logging.getLogger(__name__)


class ChatAgent:
    """
    通用聊天代理
    
    封装聊天系统的核心功能，包括：
    - 消息上下文管理
    - 模型调用和流式响应
    - 多模型容错机制
    - 工具调用支持
    """

    def __init__(
        self,
        message_id: str,
        system_prompt_generator: Callable[[PromptGeneratorParam], str],
        model_configs: list[dict[str, str]] | None = None,
    ):
        """
        初始化聊天代理
        
        Args:
            message_id: 消息ID，用于获取上下文
            system_prompt_generator: 系统提示词生成器
            model_configs: 模型配置列表，格式为 [{"id": "model_id", "name": "model_name"}]
        """
        self.message_id = message_id
        self.message_context = MessageContext(message_id, system_prompt_generator)
        
        # 默认模型配置
        self.model_configs = model_configs or [
            {"id": "302.ai/gpt-4.1", "name": "主模型"},
            {"id": "Moonshot/kimi-k2", "name": "备用模型"},
        ]

    @classmethod
    async def create_with_default_prompt(
        cls,
        message_id: str,
        model_configs: list[dict[str, str]] | None = None,
    ) -> "ChatAgent":
        """
        使用默认提示词创建ChatAgent实例
        
        Args:
            message_id: 消息ID
            model_configs: 模型配置列表
            
        Returns:
            已初始化的ChatAgent实例
        """
        from app.services.chat.prompt import ChatPromptService
        
        # 获取默认提示词
        prompt = await ChatPromptService.get_prompt({})
        
        # 创建实例
        agent = cls(
            message_id=message_id,
            system_prompt_generator=lambda param: prompt,
            model_configs=model_configs,
        )
        
        # 初始化上下文
        await agent.initialize()
        
        return agent

    async def initialize(self) -> None:
        """初始化上下文消息"""
        await self.message_context.init_context_messages()

    async def generate_stream_response(
        self,
        yield_interval: float = 0.5,
        enable_tools: bool = True,
        temperature: float = 0.7,
    ) -> AsyncGenerator[ChatStreamChunk, None]:
        """
        生成流式响应
        
        Args:
            yield_interval: 输出间隔时间
            enable_tools: 是否启用工具调用
            temperature: 模型温度参数
            
        Yields:
            ChatStreamChunk: 流式响应数据块
        """
        # 构建消息
        messages = self.message_context.build(PromptGeneratorParam())
        
        accumulated_content = ChatStreamChunk(content="", reason_content="")
        last_yield_time = asyncio.get_event_loop().time()

        # 尝试多个模型
        for i, model_config in enumerate(self.model_configs):
            try:
                async for chunk in self._stream_with_model(
                    messages=messages,
                    model_id=model_config["id"],
                    yield_interval=yield_interval,
                    accumulated=accumulated_content,
                    last_yield_time=last_yield_time,
                    enable_tools=enable_tools,
                    temperature=temperature,
                ):
                    yield chunk
                    last_yield_time = asyncio.get_event_loop().time()

                # 成功完成，直接返回
                return

            except ContentFilterError as e:
                if i < len(self.model_configs) - 1:
                    logger.warning(f"{model_config['name']}内容过滤，切换模型: {str(e)}")
                    await self._handle_partial_response(messages, accumulated_content)
                    last_yield_time = asyncio.get_event_loop().time()
                else:
                    logger.error(f"所有模型都因内容过滤失败: {str(e)}")
                    yield ChatStreamChunk(content="抱歉，我不能讨论这个话题")
                    return

            except Exception as e:
                if i < len(self.model_configs) - 1:
                    logger.warning(f"{model_config['name']}失败，切换模型: {str(e)}")
                    await self._handle_partial_response(messages, accumulated_content)
                    last_yield_time = asyncio.get_event_loop().time()
                else:
                    logger.error(f"所有模型都失败: {str(e)}")
                    raise

    async def _stream_with_model(
        self,
        messages: list[dict[str, Any]],
        model_id: str,
        yield_interval: float,
        accumulated: ChatStreamChunk,
        last_yield_time: float,
        enable_tools: bool = True,
        temperature: float = 0.7,
    ) -> AsyncGenerator[ChatStreamChunk, None]:
        """
        使用指定模型进行流式回复生成
        """
        async for chunk in AIChatService.stream_ai_reply(
            messages=messages,
            model_id=model_id,
            enable_tools=enable_tools,
            temperature=temperature,
        ):
            # 累积内容
            if chunk.content:
                accumulated.content = f"{accumulated.content or ''}{chunk.content}"
            if chunk.reason_content:
                accumulated.reason_content = (
                    f"{accumulated.reason_content or ''}{chunk.reason_content}"
                )
            if chunk.tool_call_feedback:
                accumulated.tool_call_feedback = chunk.tool_call_feedback

            # 检查是否到了输出间隔时间
            current_time = asyncio.get_event_loop().time()
            if current_time - last_yield_time >= yield_interval:
                if accumulated.has_content():
                    yield_chunk = ChatStreamChunk(
                        content=accumulated.content,
                        reason_content=accumulated.reason_content,
                        tool_call_feedback=accumulated.tool_call_feedback,
                    )
                    logger.debug(f"yield_chunk: {yield_chunk.model_dump_json()}")
                    yield yield_chunk
                    last_yield_time = current_time

        # 输出最后剩余的内容
        if accumulated.has_content():
            final_chunk = ChatStreamChunk(
                content=accumulated.content,
                reason_content=accumulated.reason_content,
                tool_call_feedback=accumulated.tool_call_feedback,
            )
            yield final_chunk

    async def _handle_partial_response(
        self, messages: list[dict[str, Any]], accumulated_content: ChatStreamChunk
    ) -> None:
        """处理部分响应，将已生成的内容添加到消息列表中"""
        if accumulated_content.content:
            messages.append(
                {
                    "role": "assistant",
                    "content": accumulated_content.content,
                    "partial": True,
                }
            )

    def add_temp_message(self, message: dict[str, Any]) -> None:
        """添加临时消息到上下文"""
        self.message_context.append_message(message)

    def get_context_messages(self) -> list[dict[str, Any]]:
        """获取构建好的上下文消息"""
        return self.message_context.build(PromptGeneratorParam())