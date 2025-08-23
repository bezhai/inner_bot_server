"""
多模型回退 Agent
将原来在 ChatService 中的多模型回退逻辑移到 Agent 层
"""

import asyncio
import logging
import traceback
from collections.abc import AsyncGenerator
from typing import Any, Dict, List, Optional

from .react_agent import ReactAgent, ContentFilterError
from app.types.chat import ChatStreamChunk
from app.services.chat.tool_status import ToolStatusService

logger = logging.getLogger(__name__)


class MultiModelAgent:
    """
    多模型回退 Agent
    将原来 ChatService.generate_ai_reply 的多模型回退逻辑移到这里
    """
    
    def __init__(self, config):
        self.config = config
        self.react_agent = ReactAgent(config)
        
        # 默认的模型配置（从 ChatService 移过来）
        self.fallback_models = [
            {"id": "302.ai/gpt-4.1", "name": "主模型"},
            {"id": "Moonshot/kimi-k2-0711-preview", "name": "备用模型"},
        ]
    
    async def _handle_partial_response(
        self, 
        messages: list[dict[str, Any]], 
        accumulated_content: ChatStreamChunk
    ) -> None:
        """
        处理部分响应，将已生成的内容添加到消息列表中
        从 ChatService._handle_partial_response 移过来
        """
        if accumulated_content.content:
            messages.append({
                "role": "assistant",
                "content": accumulated_content.content,
                "partial": True,
            })
    
    async def _stream_with_model(
        self,
        messages: list[dict[str, Any]],
        model_id: str,
        yield_interval: float,
        accumulated: ChatStreamChunk,
        last_yield_time: float,
    ) -> AsyncGenerator[ChatStreamChunk, None]:
        """
        使用指定模型进行流式回复生成
        从 ChatService._stream_with_model 移过来
        """
        async for chunk in self.react_agent.stream_ai_reply(
            messages=messages,
            model_id=model_id,
            enable_tools=self.config.tool_filter is not None,
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
                if accumulated.has_content() or accumulated.tool_call_feedback:
                    yield_chunk = ChatStreamChunk(
                        content=accumulated.content,
                        reason_content=accumulated.reason_content,
                        tool_call_feedback=accumulated.tool_call_feedback,
                    )
                    logger.info(f"yield_chunk: {yield_chunk.model_dump_json()}")
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
    
    async def generate_ai_reply(
        self,
        message_id: str,
        yield_interval: float = 0.5,
    ) -> AsyncGenerator[ChatStreamChunk, None]:
        """
        生成 AI 回复内容（支持多轮对话）
        从 ChatService.generate_ai_reply 移过来的核心逻辑
        """
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
            if self.config.enable_memory and message_id:
                try:
                    memory_messages = await self.react_agent.memory_adapter.get_conversation_context(
                        message_id,
                        lambda param: self.config.description
                    )
                    # 只取非系统消息，避免重复系统提示词
                    for msg in memory_messages:
                        if msg.get("role") != "system":
                            messages.append(msg)
                except Exception as e:
                    logger.warning(f"Failed to load memory context: {e}")
            
            # 使用配置的模型或默认的回退模型
            model_configs = []
            if self.config.model_configs:
                model_configs = [
                    {"id": model.model_id, "name": f"模型{i+1}"}
                    for i, model in enumerate(self.config.model_configs)
                ]
            else:
                model_configs = self.fallback_models

            accumulated_content = ChatStreamChunk(content="", reason_content="")
            last_yield_time = asyncio.get_event_loop().time()

            for i, model_config in enumerate(model_configs):
                try:
                    async for chunk in self._stream_with_model(
                        messages=messages,
                        model_id=model_config["id"],
                        yield_interval=yield_interval,
                        accumulated=accumulated_content,
                        last_yield_time=last_yield_time,
                    ):
                        yield chunk
                        last_yield_time = asyncio.get_event_loop().time()

                    # 成功完成，直接返回
                    return

                except ContentFilterError as e:
                    if i < len(model_configs) - 1:
                        logger.warning(
                            f"{model_config['name']}内容过滤，切换模型: {str(e)}"
                        )
                        await self._handle_partial_response(
                            messages, accumulated_content
                        )
                        last_yield_time = asyncio.get_event_loop().time()
                    else:
                        logger.error(f"所有模型都因内容过滤失败: {str(e)}")
                        yield ChatStreamChunk(content="赤尾有点不想讨论这个话题呢~")
                        return

                except Exception as e:
                    if i < len(model_configs) - 1:
                        logger.warning(
                            f"{model_config['name']}失败，切换模型: {str(e)}"
                        )
                        await self._handle_partial_response(
                            messages, accumulated_content
                        )
                        last_yield_time = asyncio.get_event_loop().time()
                    else:
                        logger.error(f"所有模型都失败: {str(e)}")
                        raise

        except Exception as e:
            logger.error(f"生成AI回复时出错: {str(e)}\n{traceback.format_exc()}")
            yield ChatStreamChunk(content="赤尾好像遇到了一些问题呢QAQ")
    
    async def process_stream(
        self,
        input_message: str,
        context: Optional[Dict[str, Any]] = None
    ) -> AsyncGenerator[ChatStreamChunk, None]:
        """处理输入并返回流式响应（支持多模型回退）"""
        try:
            message_id = context.get("message_id") if context else None
            if not message_id:
                # 如果没有 message_id，降级为单模型处理
                async for chunk in self.react_agent.process_stream(input_message, context):
                    yield chunk
                return
            
            # 使用多模型回退逻辑
            async for chunk in self.generate_ai_reply(
                message_id=message_id,
                yield_interval=0.5,
            ):
                yield chunk
                
        except Exception as e:
            logger.error(f"MultiModelAgent error: {e}")
            yield ChatStreamChunk(content=f"处理请求时出现错误: {str(e)}")