"""
LangGraph 图构建和执行
"""

import logging
from typing import Dict, Any, Optional, AsyncGenerator

from langgraph.graph import StateGraph, END

from app.types.chat import ChatStreamChunk
from .state import ChatGraphState, init_state
from .nodes import (
    initialize_node,
    prompt_generation_node,
    model_call_node,
    tool_execution_node,
    output_processing_node,
    cleanup_node,
    should_continue_with_tools,
    should_continue_after_tools,
)
from .streaming import process_streaming_response

logger = logging.getLogger(__name__)


def create_chat_graph():
    """
    创建聊天图工作流
    
    Returns:
        编译后的图对象
    """
    # 1. 创建状态图
    graph = StateGraph(ChatGraphState)
    
    # 2. 添加节点
    graph.add_node("initialize", initialize_node)
    graph.add_node("prompt_generation", prompt_generation_node)
    graph.add_node("model_call", model_call_node)
    graph.add_node("tool_execution", tool_execution_node)
    graph.add_node("output_processing", output_processing_node)
    graph.add_node("cleanup", cleanup_node)
    
    # 3. 设置入口点
    graph.set_entry_point("initialize")
    
    # 4. 添加边
    graph.add_edge("initialize", "prompt_generation")
    graph.add_edge("prompt_generation", "model_call")
    
    # 5. 添加条件边
    graph.add_conditional_edges(
        "model_call",
        should_continue_with_tools,
        {
            "tool_execution": "tool_execution",
            "output_processing": "output_processing"
        }
    )
    
    graph.add_conditional_edges(
        "tool_execution",
        should_continue_after_tools,
        {
            "model_call": "model_call",
            "output_processing": "output_processing"
        }
    )
    
    graph.add_edge("output_processing", "cleanup")
    graph.add_edge("cleanup", END)
    
    # 6. 编译图
    compiled_graph = graph.compile()
    
    logger.info("聊天图工作流创建完成")
    return compiled_graph


class ChatGraphExecutor:
    """
    聊天图执行器
    """
    
    def __init__(self):
        self.graph = create_chat_graph()
    
    async def execute(
        self,
        message_id: str,
        model_config: Optional[Dict[str, Any]] = None,
        streaming_config: Optional[Dict[str, Any]] = None
    ) -> ChatGraphState:
        """
        执行图工作流
        
        Args:
            message_id: 消息ID
            model_config: 模型配置
            streaming_config: 流式配置
            
        Returns:
            最终状态
        """
        # 默认配置
        if model_config is None:
            model_config = {
                "model_id": "gpt-4o-mini",
                "temperature": 0.7,
                "enable_tools": True,
            }
        
        if streaming_config is None:
            streaming_config = {"yield_interval": 0.5}
        
        # 初始化状态
        initial_state = init_state(
            message_id=message_id,
            model_config=model_config,
            streaming_config=streaming_config
        )
        
        try:
            # 执行图
            final_state = await self.graph.ainvoke(initial_state)
            
            # 检查是否有错误
            if final_state.get("error_message"):
                logger.error(f"图执行出错: {final_state['error_message']}")
            else:
                logger.info(f"图执行成功: {message_id}")
            
            return final_state
            
        except Exception as e:
            logger.error(f"图执行失败: {message_id}, 错误: {str(e)}")
            # 返回错误状态
            initial_state["error_message"] = str(e)
            return initial_state
    
    async def stream_execute(
        self,
        message_id: str,
        model_config: Optional[Dict[str, Any]] = None,
        streaming_config: Optional[Dict[str, Any]] = None
    ) -> AsyncGenerator[ChatStreamChunk, None]:
        """
        流式执行图工作流
        
        Args:
            message_id: 消息ID
            model_config: 模型配置
            streaming_config: 流式配置
            
        Yields:
            ChatStreamChunk: 流式响应块
        """
        # 执行图
        final_state = await self.execute(
            message_id=message_id,
            model_config=model_config,
            streaming_config=streaming_config
        )
        
        # 如果有错误，输出错误信息
        if final_state.get("error_message"):
            error_chunk = ChatStreamChunk(
                content=f"处理失败: {final_state['error_message']}"
            )
            yield error_chunk
            return
        
        # 处理流式输出
        yield_interval = streaming_config.get("yield_interval", 0.5) if streaming_config else 0.5
        async for chunk in process_streaming_response(final_state, yield_interval):
            yield chunk


# 全局图执行器实例
_chat_graph_executor: Optional[ChatGraphExecutor] = None


def get_chat_graph_executor() -> ChatGraphExecutor:
    """
    获取聊天图执行器实例
    
    Returns:
        聊天图执行器
    """
    global _chat_graph_executor
    if _chat_graph_executor is None:
        _chat_graph_executor = ChatGraphExecutor()
    return _chat_graph_executor


async def execute_chat_graph(
    message_id: str,
    model_config: Optional[Dict[str, Any]] = None,
    streaming_config: Optional[Dict[str, Any]] = None
) -> AsyncGenerator[ChatStreamChunk, None]:
    """
    执行聊天图工作流的便捷函数
    
    Args:
        message_id: 消息ID
        model_config: 模型配置
        streaming_config: 流式配置
        
    Yields:
        ChatStreamChunk: 流式响应块
    """
    executor = get_chat_graph_executor()
    async for chunk in executor.stream_execute(
        message_id=message_id,
        model_config=model_config,
        streaming_config=streaming_config
    ):
        yield chunk