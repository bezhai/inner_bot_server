import asyncio
from typing import AsyncGenerator, Optional, List, Dict, Any
from .model import ModelService
from .prompt import PromptService

# 使用新的工具系统
from app.tools import get_tool_manager


class ChatService:

    @staticmethod
    async def generate_ai_reply(
        user_input: str,
        model_id: str = "gpt-4o-mini",
        temperature: float = 0.7,
        yield_interval: float = 0.5,
        enable_tools: bool = False,
        max_tool_iterations: int = 10,
    ) -> AsyncGenerator[str, None]:
        """
        生成AI回复的流式响应，支持工具调用

        Args:
            user_input: 用户输入的文本
            model_id: 模型ID，默认为gpt-4o-mini
            temperature: 温度参数
            yield_interval: 输出间隔时间，用于控制客户端接收频率
            enable_tools: 是否启用工具调用
            max_tool_iterations: 最大工具调用迭代次数

        Yields:
            str: 累积的文本片段
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

        # 用于累积文本内容
        accumulated_text = ""
        last_yield_time = asyncio.get_event_loop().time()

        try:
            # 获取流式响应
            async for chunk in ModelService.chat_completion_stream(
                model_id=model_id,
                messages=messages,
                temperature=temperature,
                tools=tools,
                max_tool_iterations=max_tool_iterations,
            ):
                # 提取文本内容
                if chunk.delta and chunk.delta.content:
                    accumulated_text += chunk.delta.content

                    # 检查是否到了输出间隔时间
                    current_time = asyncio.get_event_loop().time()
                    if current_time - last_yield_time >= yield_interval:
                        if accumulated_text.strip():  # 只有当有内容时才输出
                            yield accumulated_text
                            accumulated_text = ""  # 重置累积内容
                            last_yield_time = current_time

                # 如果收到finish_reason，说明完成了
                if chunk.finish_reason:
                    break

            # 输出最后剩余的内容
            if accumulated_text.strip():
                yield accumulated_text

        except Exception as e:
            # 如果出现错误，输出错误信息
            error_msg = f"生成回复时出现错误: {str(e)}"
            yield error_msg
