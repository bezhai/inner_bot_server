"""
LangGraph 流式输出处理
"""

import asyncio
import logging
from typing import AsyncGenerator, Dict, Any

from app.types.chat import ChatStreamChunk
from .state import ChatGraphState, should_yield_output, create_yield_chunk, update_yield_time

logger = logging.getLogger(__name__)


class StreamingManager:
    """
    流式输出管理器
    负责管理流式输出的时间间隔和内容累积
    """
    
    def __init__(self, yield_interval: float = 0.5):
        self.yield_interval = yield_interval
        self.last_yield_time = 0.0
        self.accumulated_content = ""
        self.accumulated_reason = ""
    
    def should_yield(self) -> bool:
        """
        检查是否应该输出
        
        Returns:
            是否应该输出
        """
        current_time = asyncio.get_event_loop().time()
        return (current_time - self.last_yield_time) >= self.yield_interval
    
    def yield_chunk(self, chunk: ChatStreamChunk) -> ChatStreamChunk:
        """
        输出流式块
        
        Args:
            chunk: 流式块
            
        Returns:
            累积的流式块
        """
        # 累积内容
        if chunk.content:
            self.accumulated_content += chunk.content
        if chunk.reason_content:
            self.accumulated_reason += chunk.reason_content
        
        # 创建累积块
        accumulated_chunk = ChatStreamChunk(
            content=self.accumulated_content,
            reason_content=self.accumulated_reason,
            tool_call_feedback=chunk.tool_call_feedback
        )
        
        # 更新时间
        self.last_yield_time = asyncio.get_event_loop().time()
        
        return accumulated_chunk
    
    def get_final_chunk(self) -> ChatStreamChunk:
        """
        获取最终块
        
        Returns:
            最终的流式块
        """
        return ChatStreamChunk(
            content=self.accumulated_content,
            reason_content=self.accumulated_reason,
            tool_call_feedback=None
        )


async def process_streaming_response(
    state: ChatGraphState,
    yield_interval: float = 0.5
) -> AsyncGenerator[ChatStreamChunk, None]:
    """
    处理流式响应输出
    
    Args:
        state: 图状态
        yield_interval: 输出间隔
        
    Yields:
        ChatStreamChunk: 流式响应块
    """
    streaming_manager = StreamingManager(yield_interval)
    
    # 获取所有accumulated chunks
    chunks = state.get("current_chunks", [])
    
    if not chunks:
        # 如果没有chunks，直接返回累积的内容
        if state.get("accumulated_content") or state.get("accumulated_reason"):
            final_chunk = ChatStreamChunk(
                content=state.get("accumulated_content", ""),
                reason_content=state.get("accumulated_reason", ""),
                tool_call_feedback=state.get("tool_call_feedback")
            )
            logger.info(f"输出累积内容: {final_chunk.model_dump_json()}")
            yield final_chunk
        return
    
    for chunk in chunks:
        # 累积内容
        streaming_manager.yield_chunk(chunk)
        
        # 检查是否应该输出
        if streaming_manager.should_yield():
            if (streaming_manager.accumulated_content.strip() or 
                streaming_manager.accumulated_reason.strip()):
                yield_chunk = ChatStreamChunk(
                    content=streaming_manager.accumulated_content,
                    reason_content=streaming_manager.accumulated_reason,
                    tool_call_feedback=chunk.tool_call_feedback
                )
                logger.info(f"输出流式块: {yield_chunk.model_dump_json()}")
                yield yield_chunk
    
    # 输出最终剩余内容
    if (streaming_manager.accumulated_content.strip() or 
        streaming_manager.accumulated_reason.strip()):
        final_chunk = streaming_manager.get_final_chunk()
        logger.info(f"输出最终块: {final_chunk.model_dump_json()}")
        yield final_chunk


def process_graph_output_sync(
    state: ChatGraphState,
    yield_interval: float = 0.5
) -> AsyncGenerator[ChatStreamChunk, None]:
    """
    处理图输出的同步版本
    
    Args:
        state: 图状态
        yield_interval: 输出间隔
        
    Yields:
        ChatStreamChunk: 流式响应块
    """
    return process_streaming_response(state, yield_interval)
