"""
聊天服务层
处理聊天相关的业务逻辑
"""

import asyncio
import logging
import traceback
from collections.abc import AsyncGenerator
from typing import Any

from app.services.chat.agent import ChatAgent
from app.types.chat import (
    ChatNormalResponse,
    ChatProcessResponse,
    ChatRequest,
    ChatStreamChunk,
    Step,
)
from app.utils.decorators import auto_json_serialize

logger = logging.getLogger(__name__)


class ChatService:
    """聊天服务类"""

    @staticmethod
    async def generate_ai_reply(
        message_id: str,
        yield_interval: float = 0.5,
    ) -> AsyncGenerator[ChatStreamChunk, None]:
        """
        生成 AI 回复内容（支持多轮对话）

        Args:
            message_id: 消息ID，用于获取上下文消息
            yield_interval: 输出间隔时间，用于控制客户端接收频率

        Yields:
            ChatStreamChunk: AI 生成的回复内容片段，包含当前chunk和累积的完整内容
        """
        try:
            # 使用ChatAgent生成回复
            chat_agent = await ChatAgent.create_with_default_prompt(message_id)
            
            async for chunk in chat_agent.generate_stream_response(
                yield_interval=yield_interval
            ):
                yield chunk

        except Exception as e:
            logger.error(f"生成AI回复时出错: {str(e)}\n{traceback.format_exc()}")
            yield ChatStreamChunk(content="抱歉，遇到了一些问题")

    @staticmethod
    @auto_json_serialize
    async def process_chat_sse(
        request: ChatRequest,
        yield_interval: float = 0.5,
    ) -> AsyncGenerator[ChatNormalResponse | ChatProcessResponse, None]:
        """
        处理 SSE 聊天流程

        Args:
            request: 聊天请求对象
            yield_interval: 输出间隔时间，用于控制客户端接收频率

        Yields:
            ChatNormalResponse | ChatProcessResponse: 聊天响应对象
        """
        from app.services.meta_info import AsyncRedisClient

        # 获取Redis实例并加锁
        redis = AsyncRedisClient.get_instance()
        lock_key = f"msg_lock:{request.message_id}"

        try:
            # 加锁，过期时间60秒
            await redis.set(lock_key, "1", nx=True, ex=60)
            logger.info(f"消息锁定成功: {request.message_id}")
        except Exception as e:
            logger.warning(f"消息加锁失败: {request.message_id}, 错误: {str(e)}")
            # 即使加锁失败也继续处理

        try:
            # 1. 接收消息确认
            yield ChatNormalResponse(step=Step.ACCEPT)

            # 3. 开始生成回复
            yield ChatNormalResponse(step=Step.START_REPLY)

            # 4. 生成并发送回复
            last_content = ""  # 用于跟踪最后的内容

            # 使用原有服务
            async for chunk in ChatService.generate_ai_reply(
                request.message_id, yield_interval=yield_interval
            ):
                last_content = chunk.content  # 保存最后的内容（已经转换过）
                yield ChatProcessResponse(
                    step=Step.SEND,
                    content=chunk.content,
                    # reason_content=chunk.reason_content,
                    tool_call_feedback=chunk.tool_call_feedback,
                )

            # 5. 回复成功，返回完整内容
            yield ChatProcessResponse(
                step=Step.SUCCESS,
                content=last_content,  # 使用保存的最后内容（已经转换过）
                # reason_content=chunk.reason_content,
            )

        except Exception as e:
            logger.error(f"SSE 聊天处理失败: {str(e)}\n{traceback.format_exc()}")
            yield ChatNormalResponse(step=Step.FAILED)
        finally:
            # 解锁
            try:
                await redis.delete(lock_key)
                logger.info(f"消息解锁成功: {request.message_id}")
            except Exception as e:
                logger.warning(f"消息解锁失败: {request.message_id}, 错误: {str(e)}")

            # 7. 流程结束
            yield ChatNormalResponse(step=Step.END)


# 创建服务实例
chat_service = ChatService()
