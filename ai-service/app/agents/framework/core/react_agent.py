"""
React Agent 实现
将原来在 Service 层的 AIChatService 逻辑移到 Agent 层
"""

import logging
import traceback
from collections.abc import AsyncGenerator
from typing import Any, Dict, List, Optional

from ..adapters.model import get_model_adapter
from ..adapters.tool import get_tool_adapter
from ..adapters.memory import get_memory_adapter
from app.types.chat import ChatStreamChunk, ToolCallFeedbackResponse
from app.services.chat.tool_status import ToolStatusService
from app.services.chat.model import ModelService

logger = logging.getLogger(__name__)


class ContentFilterError(Exception):
    """内容过滤异常"""
    
    def __init__(self):
        super().__init__("内容被过滤")


class ReactAgent:
    """
    React Agent - 核心的推理-行动循环逻辑
    将原来 AIChatService.stream_ai_reply 的逻辑移到这里
    """
    
    def __init__(self, config):
        self.config = config
        self.model_adapter = get_model_adapter()
        self.tool_adapter = get_tool_adapter()
        self.memory_adapter = get_memory_adapter()
    
    async def stream_ai_reply(
        self,
        messages: list[dict],
        model_id: str = "302.ai/gpt-4o-mini",
        temperature: float = 0.7,
        enable_tools: bool = False,
        max_tool_iterations: int = 10,
    ) -> AsyncGenerator[ChatStreamChunk, None]:
        """
        生成AI回复的流式响应，支持工具调用和多轮对话
        这是从 AIChatService.stream_ai_reply 移过来的核心逻辑
        """
        try:
            # 准备工具调用参数
            tools = None
            if enable_tools:
                try:
                    # 使用工具适配器获取过滤后的工具
                    if self.config.tool_filter:
                        tools = self.tool_adapter.get_tools_schema(self.config.tool_filter)
                    else:
                        tools = self.tool_adapter.get_tools_schema()
                except RuntimeError:
                    # 工具系统未初始化，禁用工具
                    enable_tools = False

            # 获取流式响应并直接传递
            first_content_chunk = True
            async for chunk in ModelService.chat_completion_stream(
                model_id=model_id,
                messages=messages,
                temperature=temperature,
                tools=tools,
                max_tool_iterations=max_tool_iterations,
            ):
                # 检查是否有工具调用
                if chunk.delta and chunk.delta.tool_calls:  # pyright: ignore[reportAttributeAccessIssue]
                    # 获取第一个工具调用的名称
                    first_tool_call = chunk.delta.tool_calls[0]  # pyright: ignore[reportAttributeAccessIssue]
                    if (
                        hasattr(first_tool_call, "function")
                        and hasattr(first_tool_call.function, "name")
                        and first_tool_call.function.name
                    ):
                        tool_name = first_tool_call.function.name
                        status_message = ToolStatusService.get_tool_status_message(
                            tool_name
                        )
                        logger.info(
                            f"tool_name: {tool_name}, status_message: {status_message}"
                        )
                        yield ChatStreamChunk(
                            tool_call_feedback=ToolCallFeedbackResponse(
                                name=tool_name, status_message=status_message
                            )
                        )

                # 提取文本内容并直接输出
                if chunk.delta and chunk.delta.content:  # pyright: ignore[reportAttributeAccessIssue]
                    # 如果是第一次有文本内容，更新状态为回复中
                    if first_content_chunk:
                        first_content_chunk = False
                        yield ChatStreamChunk(
                            tool_call_feedback=ToolCallFeedbackResponse(
                                name="text_generation",
                                status_message=ToolStatusService.get_default_status_message(
                                    "replying"
                                ),
                            )
                        )
                    yield ChatStreamChunk(
                        content=chunk.delta.content,  # pyright: ignore[reportAttributeAccessIssue]
                    )

                # finish_reason包含四种结果, 除tool_calls外, 其他结果都表示完成
                if chunk.finish_reason:
                    logger.info(f"chunk.finish_reason: {chunk.finish_reason}")
                    # 如果是content_filter, 抛出异常以便上层处理
                    if chunk.finish_reason == "content_filter":
                        raise ContentFilterError()
                    elif chunk.finish_reason == "length":
                        yield ChatStreamChunk(
                            content="(后续内容被截断)",
                        )

                    # 除tool_calls外, 其他都需要中止
                    if chunk.finish_reason != "tool_calls":
                        break
                    else:
                        # 重置标志，为下一轮做准备
                        first_content_chunk = True

        except ContentFilterError:
            # 内容过滤错误需要重新抛出，让上层处理模型切换
            raise
        except Exception as e:
            # 如果出现其他错误，输出错误信息
            logger.error(f"生成回复时出现错误: {str(e)}\n{traceback.format_exc()}")
            yield ChatStreamChunk(content=f"生成回复时出现错误: {str(e)}")
    
    async def process_stream(
        self,
        input_message: str,
        context: Optional[Dict[str, Any]] = None
    ) -> AsyncGenerator[ChatStreamChunk, None]:
        """处理输入并返回流式响应"""
        try:
            # 准备消息（使用内存适配器）
            messages = []
            
            # 添加系统提示词
            if self.config.description:
                messages.append({
                    "role": "system",
                    "content": self.config.description
                })
            
            # 从内存中获取上下文
            if self.config.enable_memory and context and context.get("message_id"):
                try:
                    memory_messages = await self.memory_adapter.get_conversation_context(
                        context["message_id"],
                        lambda param: self.config.description
                    )
                    # 只取非系统消息，避免重复系统提示词
                    for msg in memory_messages:
                        if msg.get("role") != "system":
                            messages.append(msg)
                except Exception as e:
                    logger.warning(f"Failed to load memory context: {e}")
            
            # 添加当前输入
            messages.append({
                "role": "user",
                "content": input_message
            })
            
            # 发送初始状态
            yield ChatStreamChunk(
                tool_call_feedback=ToolCallFeedbackResponse(
                    name="thinking",
                    status_message=ToolStatusService.get_default_status_message("thinking")
                )
            )
            
            # 使用核心的 stream_ai_reply 逻辑
            model_id = self.config.model_configs[0].model_id
            temperature = self.config.model_configs[0].temperature
            
            async for chunk in self.stream_ai_reply(
                messages=messages,
                model_id=model_id,
                temperature=temperature,
                enable_tools=self.config.tool_filter is not None,
                max_tool_iterations=self.config.max_iterations,
            ):
                yield chunk
                
        except Exception as e:
            logger.error(f"ReactAgent error: {e}")
            yield ChatStreamChunk(content=f"处理请求时出现错误: {str(e)}")


class SimpleAgent:
    """简单 Agent - 不启用工具的版本"""
    
    def __init__(self, config):
        self.config = config
        self.react_agent = ReactAgent(config)
    
    async def process_stream(
        self,
        input_message: str,
        context: Optional[Dict[str, Any]] = None
    ) -> AsyncGenerator[ChatStreamChunk, None]:
        """简单的流式处理 - 禁用工具"""
        try:
            # 准备消息
            messages = []
            
            if self.config.description:
                messages.append({
                    "role": "system",
                    "content": self.config.description
                })
            
            messages.append({
                "role": "user",
                "content": input_message
            })
            
            # 发送状态消息
            yield ChatStreamChunk(
                tool_call_feedback=ToolCallFeedbackResponse(
                    name="thinking",
                    status_message=ToolStatusService.get_default_status_message("thinking")
                )
            )
            
            # 使用 ReactAgent 的核心逻辑，但禁用工具
            model_id = self.config.model_configs[0].model_id
            temperature = self.config.model_configs[0].temperature
            
            async for chunk in self.react_agent.stream_ai_reply(
                messages=messages,
                model_id=model_id,
                temperature=temperature,
                enable_tools=False,  # 简单 Agent 不启用工具
                max_tool_iterations=1,
            ):
                yield chunk
                
        except Exception as e:
            logger.error(f"SimpleAgent error: {e}")
            yield ChatStreamChunk(content=f"处理请求时出现错误: {str(e)}")