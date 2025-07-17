"""
LangGraph 聊天服务
与现有聊天服务完全兼容的LangGraph实现
"""

import logging
import traceback
import asyncio
from typing import AsyncGenerator, Dict, Any, Optional

from app.types.chat import ChatStreamChunk
from app.services.chat.langgraph import execute_chat_graph

logger = logging.getLogger(__name__)


class LangGraphChatService:
    """
    LangGraph 聊天服务
    与现有 AIChatService 完全兼容
    """
    
    @staticmethod
    async def stream_ai_reply(
        message_id: str,
        model_id: str = "gpt-4o-mini",
        temperature: float = 0.7,
        enable_tools: bool = True,
        max_tool_iterations: int = 10,
        yield_interval: float = 0.5,
    ) -> AsyncGenerator[ChatStreamChunk, None]:
        """
        生成AI回复的流式响应，支持工具调用和多轮对话
        
        Args:
            message_id: 消息ID
            model_id: 模型ID，默认为gpt-4o-mini
            temperature: 温度参数
            enable_tools: 是否启用工具调用
            max_tool_iterations: 最大工具调用迭代次数
            yield_interval: 输出间隔时间
            
        Yields:
            ChatStreamChunk: 流式响应数据块
        """
        # 准备模型配置
        model_config = {
            "model_id": model_id,
            "temperature": temperature,
            "enable_tools": enable_tools,
            "max_tool_iterations": max_tool_iterations,
        }
        
        # 准备流式配置
        streaming_config = {
            "yield_interval": yield_interval,
        }
        
        try:
            # 执行LangGraph工作流
            async for chunk in execute_chat_graph(
                message_id=message_id,
                model_config=model_config,
                streaming_config=streaming_config
            ):
                # 提取内容并输出
                if chunk.content or chunk.reason_content or chunk.tool_call_feedback:
                    yield chunk
                    
        except Exception as e:
            # 如果出现错误，输出错误信息
            logger.error(f"LangGraph生成回复时出现错误: {str(e)}\n{traceback.format_exc()}")
            yield ChatStreamChunk(
                content=f"生成回复时出现错误: {str(e)}"
            )


class LangGraphChatServiceWrapper:
    """
    LangGraph 聊天服务包装器
    提供与现有 ChatService 完全兼容的接口
    """
    
    @staticmethod
    async def generate_ai_reply(
        message_id: str,
        yield_interval: float = 0.5,
        model_id: str = "gpt-4o-mini",
        temperature: float = 0.7,
        enable_tools: bool = True,
    ) -> AsyncGenerator[ChatStreamChunk, None]:
        """
        生成 AI 回复内容（支持多轮对话）
        与现有 ChatService.generate_ai_reply 完全兼容
        
        Args:
            message_id: 消息ID
            yield_interval: 输出间隔时间，用于控制客户端接收频率
            model_id: 模型ID
            temperature: 温度参数
            enable_tools: 是否启用工具调用
            
        Yields:
            ChatStreamChunk: AI 生成的回复内容片段，包含累积的完整内容
        """
        # 用于累积内容（兼容现有行为）
        complete_content = ChatStreamChunk(content="", reason_content="")
        last_yield_time = asyncio.get_event_loop().time()
        
        try:
            # 调用LangGraph AI服务
            async for chunk in LangGraphChatService.stream_ai_reply(
                message_id=message_id,
                model_id=model_id,
                temperature=temperature,
                enable_tools=enable_tools,
                yield_interval=yield_interval,
            ):
                # 累积内容
                if chunk.content:
                    complete_content.content += chunk.content
                if chunk.reason_content:
                    complete_content.reason_content += chunk.reason_content
                if chunk.tool_call_feedback:
                    complete_content.tool_call_feedback = chunk.tool_call_feedback
                
                # 检查是否到了输出间隔时间
                current_time = asyncio.get_event_loop().time()
                if current_time - last_yield_time >= yield_interval:
                    if (
                        complete_content.content.strip()
                        or complete_content.reason_content.strip()
                    ):
                        # 创建新的chunk对象，包含完整累积内容
                        yield_chunk = ChatStreamChunk(
                            content=complete_content.content,
                            reason_content=complete_content.reason_content,
                            tool_call_feedback=complete_content.tool_call_feedback,
                        )
                        logger.info(f"LangGraph yield_chunk: {yield_chunk.model_dump_json()}")
                        yield yield_chunk
                        
                        last_yield_time = current_time
            
            # 输出最后剩余的内容
            if (
                complete_content.content.strip()
                or complete_content.reason_content.strip()
            ):
                final_chunk = ChatStreamChunk(
                    content=complete_content.content,
                    reason_content=complete_content.reason_content,
                    tool_call_feedback=complete_content.tool_call_feedback,
                )
                yield final_chunk
                
        except Exception as e:
            logger.error(f"LangGraph生成AI回复时出错: {str(e)}\n{traceback.format_exc()}")
            yield ChatStreamChunk(
                content=f"生成回复时出现错误: {str(e)}",
            )


# 创建LangGraph聊天服务实例
langgraph_chat_service = LangGraphChatServiceWrapper()