"""
LangGraph 聊天服务
与现有聊天服务完全兼容的LangGraph实现
"""

import logging
import traceback
from typing import AsyncGenerator

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


# 创建LangGraph聊天服务实例
langgraph_chat_service = LangGraphChatService()
