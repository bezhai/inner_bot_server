"""
LangGraph 聊天状态管理
"""

import time
from operator import add
from typing import Annotated, Any, TypedDict

from app.services.chat.context import MessageContext
from app.types.chat import ChatStreamChunk, ToolCallFeedbackResponse


class ChatGraphState(TypedDict):
    """聊天图状态定义"""

    # 基础信息
    message_id: str
    context: MessageContext | None

    # 模型配置
    model_config: dict[str, Any]

    # 提示词相关
    prompt_params: dict[str, Any]
    generated_prompt: str | None

    # 流式输出控制
    streaming_config: dict[str, Any]

    # 输出状态
    accumulated_content: str
    accumulated_reason: str
    current_chunks: Annotated[list[ChatStreamChunk], add]

    # 工具调用
    pending_tool_calls: list[dict[str, Any]]
    tool_results: list[dict[str, Any]]

    # 时间控制
    last_yield_time: float

    # 错误处理
    error_message: str | None
    finish_reason: str | None

    # 工具调用反馈
    tool_call_feedback: ToolCallFeedbackResponse | None


def init_state(
    message_id: str,
    model_config: dict[str, Any],
    streaming_config: dict[str, Any] | None = None,
) -> ChatGraphState:
    """
    初始化图状态

    Args:
        message_id: 消息ID
        model_config: 模型配置
        streaming_config: 流式配置

    Returns:
        初始化的图状态
    """
    current_time = time.time()

    return ChatGraphState(
        # 基础信息
        message_id=message_id,
        context=None,
        # 模型配置
        model_config=model_config,
        # 提示词相关
        prompt_params={},
        generated_prompt=None,
        # 流式输出控制
        streaming_config=streaming_config or {"yield_interval": 0.5},
        # 输出状态
        accumulated_content="",
        accumulated_reason="",
        current_chunks=[],
        # 工具调用
        pending_tool_calls=[],
        tool_results=[],
        # 时间控制
        last_yield_time=current_time,
        # 错误处理
        error_message=None,
        finish_reason=None,
        # 工具调用反馈
        tool_call_feedback=None,
    )


def update_state_with_chunk(
    state: ChatGraphState, chunk: ChatStreamChunk
) -> ChatGraphState:
    """
    用流式块更新状态

    Args:
        state: 当前状态
        chunk: 流式块

    Returns:
        更新后的状态
    """
    # 更新累积内容
    if chunk.content:
        state["accumulated_content"] += chunk.content
    if chunk.reason_content:
        state["accumulated_reason"] += chunk.reason_content
    if chunk.tool_call_feedback:
        state["tool_call_feedback"] = chunk.tool_call_feedback

    # 添加到当前块列表
    state["current_chunks"].append(chunk)

    return state


def update_state_with_realtime_chunk(
    state: ChatGraphState, chunk: ChatStreamChunk
) -> ChatGraphState:
    """
    用实时流式块更新状态

    Args:
        state: 当前状态
        chunk: 流式块

    Returns:
        更新后的状态
    """
    # 更新累积内容
    if chunk.content:
        state["accumulated_content"] += chunk.content
    if chunk.reason_content:
        state["accumulated_reason"] += chunk.reason_content
    if chunk.tool_call_feedback:
        state["tool_call_feedback"] = chunk.tool_call_feedback

    # 添加到当前块列表
    state["current_chunks"].append(chunk)

    # 更新时间
    import time

    state["last_yield_time"] = time.time()

    return state


def should_yield_output(state: ChatGraphState) -> bool:
    """
    检查是否应该输出内容

    Args:
        state: 当前状态

    Returns:
        是否应该输出
    """
    current_time = time.time()
    yield_interval = state["streaming_config"].get("yield_interval", 0.5)

    return (current_time - state["last_yield_time"]) >= yield_interval


def create_yield_chunk(state: ChatGraphState) -> ChatStreamChunk:
    """
    创建输出块

    Args:
        state: 当前状态

    Returns:
        输出块
    """
    return ChatStreamChunk(
        content=state["accumulated_content"],
        reason_content=state["accumulated_reason"],
        tool_call_feedback=state["tool_call_feedback"],
    )


def update_yield_time(state: ChatGraphState) -> ChatGraphState:
    """
    更新输出时间

    Args:
        state: 当前状态

    Returns:
        更新后的状态
    """
    state["last_yield_time"] = time.time()
    return state
