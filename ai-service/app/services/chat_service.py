"""
聊天服务层
处理聊天相关的业务逻辑
"""

import logging
import traceback
import asyncio
from datetime import datetime
from typing import AsyncGenerator

from app.services.chat.langgraph_chat_service import LangGraphChatServiceWrapper
from app.types.chat import (
    ChatMessage,
    ChatRequest,
    ChatStreamChunk,
    Step,
    ChatProcessResponse,
    ChatNormalResponse,
)
from app.core.clients.memory_client import memory_client
from app.utils.decorators import auto_json_serialize
from app.services.chat.message import AIChatService

logger = logging.getLogger(__name__)


class ChatService:
    """聊天服务类"""

    @staticmethod
    async def get_message_by_id(
        message_id: str, chat_id: str, user_id: str
    ) -> ChatMessage:
        """
        根据消息ID从Memory服务获取消息

        Args:
            message_id: 消息ID
            chat_id: 聊天ID
            user_id: 用户ID

        Returns:
            ChatMessage: 消息对象
        """
        try:
            result = await memory_client.get_message_by_id(
                chat_id=chat_id, user_id=user_id, message_id=message_id
            )

            if not result:
                raise ValueError(
                    f"Message with ID {message_id} not found in Memory service"
                )

            # 将Memory返回的结果转换为ChatMessage
            return ChatMessage(
                user_id=user_id,
                user_name=result.get("user_name", "未知用户"),
                content=result.get("content", ""),
                is_mention_bot=True,  # 重放时默认为True
                role="user",  # Memory服务暂时不返回role
                message_id=message_id,
                chat_id=chat_id,
                chat_type="group",  # 默认值
                create_time=result.get(
                    "create_time", str(int(datetime.now().timestamp() * 1000))
                ),
            )

        except Exception as e:
            logger.error(f"从Memory服务获取消息失败: {str(e)}")
            raise

    @staticmethod
    async def generate_ai_reply(
        message_id: str,
        yield_interval: float = 0.5,
    ) -> AsyncGenerator[ChatStreamChunk, None]:
        """
        生成 AI 回复内容（支持多轮对话）

        Args:
            request: 聊天请求对象
            yield_interval: 输出间隔时间，用于控制客户端接收频率

        Yields:
            ChatStreamChunk: AI 生成的回复内容片段，包含当前chunk和累积的完整内容
        """
        # 用于累积内容
        complete_content = ChatStreamChunk(content="", reason_content="")
        last_yield_time = asyncio.get_event_loop().time()

        try:

            # 调用底层AI服务，传入完整的对话历史
            async for chunk in AIChatService.stream_ai_reply(
                message_id=message_id,
                model_id="gpt-4.1",
                enable_tools=True,
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

                        # 创建新的chunk对象，包含当前chunk和完整内容
                        yield_chunk = ChatStreamChunk(
                            content=complete_content.content,
                            reason_content=complete_content.reason_content,
                            tool_call_feedback=complete_content.tool_call_feedback,
                        )
                        logger.info(f"yield_chunk: {yield_chunk.model_dump_json()}")
                        yield yield_chunk

                        last_yield_time = current_time

            # 输出最后剩余的内容，并进行链接转换
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
            logger.error(f"生成AI回复时出错: {str(e)}\n{traceback.format_exc()}")
            yield ChatStreamChunk(
                content=f"生成回复时出现错误: {str(e)}",
                complete_content=f"生成回复时出现错误: {str(e)}",
            )

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
        try:
            # 1. 接收消息确认
            yield ChatNormalResponse(step=Step.ACCEPT)

            # 3. 开始生成回复
            yield ChatNormalResponse(step=Step.START_REPLY)

            # 4. 生成并发送回复
            last_content = ""  # 用于跟踪最后的内容

            generate_ai_reply = ChatService.generate_ai_reply
            if request.is_canary:
                generate_ai_reply = (
                    LangGraphChatServiceWrapper.generate_ai_reply
                )

            async for chunk in generate_ai_reply(
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
            # 7. 流程结束
            yield ChatNormalResponse(step=Step.END)


# 创建服务实例
chat_service = ChatService()
