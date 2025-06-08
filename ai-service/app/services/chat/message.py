import logging
from typing import AsyncGenerator
from .model import ModelService
from .prompt import PromptService
from app.types.chat import ChatStreamChunk

# 使用新的工具系统
from app.tools import get_tool_manager

logger = logging.getLogger(__name__)

class AIChatService:

    @staticmethod
    async def stream_ai_reply(
        user_input: str,
        model_id: str = "gpt-4o-mini",
        temperature: float = 0.7,
        enable_tools: bool = False,
        max_tool_iterations: int = 10,
    ) -> AsyncGenerator[ChatStreamChunk, None]:
        """
        生成AI回复的流式响应，支持工具调用

        Args:
            user_input: 用户输入的文本
            model_id: 模型ID，默认为gpt-4o-mini
            temperature: 温度参数
            enable_tools: 是否启用工具调用
            max_tool_iterations: 最大工具调用迭代次数

        Yields:
            ChatStreamChunk: 流式响应数据块
        """
        # 获取系统提示词
        system_prompt = await PromptService.get_prompt()

        # 构建消息
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_input},
        ]

        # 准备工具调用参数
        tools = None
        if enable_tools:
            try:
                tool_manager = get_tool_manager()
                tools = tool_manager.get_tools_schema()
            except RuntimeError:
                # 工具系统未初始化，禁用工具
                enable_tools = False

        try:
            # 获取流式响应并直接传递
            async for chunk in ModelService.chat_completion_stream(
                model_id=model_id,
                messages=messages,
                temperature=temperature,
                tools=tools,
                max_tool_iterations=max_tool_iterations,
            ):
                logger.info(f"chunk: {chunk}")
                # 提取文本内容并直接输出
                if chunk.delta and chunk.delta.content:
                    yield ChatStreamChunk(
                        content=chunk.delta.content,
                        # reason_content=chunk.delta.reason_content if hasattr(chunk.delta, "reason_content") else None,
                    )

                # 如果收到finish_reason，说明完成了
                if chunk.finish_reason:
                    logger.info(f"chunk.finish_reason: {chunk.finish_reason}")
                    # 如果是content_filter, 需要返回原因
                    if chunk.finish_reason == "content_filter":
                        yield ChatStreamChunk(
                            content="赤尾有点不想讨论这个话题呢~",
                        )
                    break

        except Exception as e:
            # 如果出现错误，输出错误信息
            yield ChatStreamChunk(
                content=f"生成回复时出现错误: {str(e)}"
            )
