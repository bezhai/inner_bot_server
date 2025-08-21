import logging
import traceback
from collections.abc import AsyncGenerator

# 使用新的工具系统
from app.tools import get_tool_manager
from app.types.chat import ChatStreamChunk, ToolCallFeedbackResponse
from .tool_status import ToolStatusService

from .model import ModelService

logger = logging.getLogger(__name__)


class ContentFilterError(Exception):
    """内容过滤异常"""

    def __init__(self):
        super().__init__("内容被过滤")


class AIChatService:
    @staticmethod
    async def stream_ai_reply(
        messages: list[dict],
        model_id: str = "302.ai/gpt-4o-mini",
        temperature: float = 0.7,
        enable_tools: bool = False,
        max_tool_iterations: int = 10,
    ) -> AsyncGenerator[ChatStreamChunk, None]:
        """
        生成AI回复的流式响应，支持工具调用和多轮对话

        Args:
            messages: 对话消息列表，包含系统提示词、用户输入和上下文
            model_id: 模型ID，默认为gpt-4o-mini
            temperature: 温度参数
            enable_tools: 是否启用工具调用
            max_tool_iterations: 最大工具调用迭代次数

        Yields:
            ChatStreamChunk: 流式响应数据块
        """
        try:
            # 准备工具调用参数
            tools = None
            if enable_tools:
                try:
                    tool_manager = get_tool_manager()
                    tools = tool_manager.get_tools_schema()
                except RuntimeError:
                    # 工具系统未初始化，禁用工具
                    enable_tools = False

            # 获取流式响应并直接传递
            first_content_chunk = True
            tool_status_sent = False  # 防止重复发送工具状态消息
            async for chunk in ModelService.chat_completion_stream(
                model_id=model_id,
                messages=messages,
                temperature=temperature,
                tools=tools,
                max_tool_iterations=max_tool_iterations,
            ):
                # 检查是否有工具调用
                if chunk.delta and chunk.delta.tool_calls and not tool_status_sent:  # pyright: ignore[reportAttributeAccessIssue]
                    tool_status_sent = True
                    # 获取第一个工具调用的名称
                    first_tool_call = chunk.delta.tool_calls[0]  # pyright: ignore[reportAttributeAccessIssue]
                    if hasattr(first_tool_call, 'function') and hasattr(first_tool_call.function, 'name') and first_tool_call.function.name:
                        tool_name = first_tool_call.function.name
                        status_message = ToolStatusService.get_tool_status_message(tool_name)
                        yield ChatStreamChunk(
                            tool_call_feedback=ToolCallFeedbackResponse(
                                name=tool_name,
                                status_message=status_message
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
                                status_message=ToolStatusService.get_default_status_message("replying")
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
                        tool_status_sent = False

        except ContentFilterError:
            # 内容过滤错误需要重新抛出，让上层处理模型切换
            raise
        except Exception as e:
            # 如果出现其他错误，输出错误信息
            logger.error(f"生成回复时出现错误: {str(e)}\n{traceback.format_exc()}")
            yield ChatStreamChunk(content=f"生成回复时出现错误: {str(e)}")
