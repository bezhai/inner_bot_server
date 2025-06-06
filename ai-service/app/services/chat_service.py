"""
聊天服务层
处理聊天相关的业务逻辑
"""

import logging
import traceback
from datetime import datetime
from typing import AsyncGenerator

from app.types.chat import (
    ChatMessage,
    ChatRequest,
    ChatStreamChunk,
    Step,
    ChatProcessResponse,
    ChatNormalResponse,
)
from app.orm.crud import create_formated_message, get_formated_message_by_message_id
from app.utils.decorators import auto_json_serialize
from app.services.chat.chat_service import ChatService as AIChatService

logger = logging.getLogger(__name__)


class ChatService:
    """聊天服务类"""

    @staticmethod
    async def save_message_to_db(message: ChatMessage) -> None:
        """
        将聊天消息保存到数据库

        Args:
            request: 聊天请求对象

        Raises:
            Exception: 数据库写入失败时抛出异常
        """
        try:
            data = message.model_dump()
            # 将毫秒时间戳转换为datetime对象
            data["create_time"] = datetime.fromtimestamp(
                int(data["create_time"]) / 1000
            )
            await create_formated_message(data)
            logger.info(f"消息已保存到数据库: message_id={message.message_id}")
        except Exception as e:
            logger.error(f"写入数据库失败: {str(e)}\n{traceback.format_exc()}")
            raise

    @staticmethod
    async def get_message_by_id(message_id: str) -> ChatMessage:
        """
        根据消息id获取消息
        """
        return await get_formated_message_by_message_id(message_id)

    @staticmethod
    async def generate_ai_reply(
        request: ChatMessage,
    ) -> AsyncGenerator[ChatStreamChunk, None]:
        """
        生成 AI 回复内容

        Args:
            request: 聊天请求对象

        Yields:
            str: AI 生成的回复内容片段
        """
        async for chunk in AIChatService.generate_ai_reply(
            user_input=request.content,
            model_id="gpt-4o",
            enable_tools=True,
        ):
            yield chunk

    @staticmethod
    @auto_json_serialize
    async def process_chat_sse(
        request: ChatRequest,
    ) -> AsyncGenerator[ChatNormalResponse | ChatProcessResponse, None]:
        """
        处理 SSE 聊天流程

        Args:
            request: 聊天请求对象

        Yields:
            ChatNormalResponse | ChatProcessResponse: 聊天响应对象
        """
        try:
            # 1. 接收消息确认
            yield ChatNormalResponse(step=Step.ACCEPT)

            message = request.message

            if not request.is_replay and not message:
                raise ValueError("message is required")

            if request.is_replay:
                message = await ChatService.get_message_by_id(request.message_id)
            else:
                await ChatService.save_message_to_db(message)

            # 3. 开始生成回复
            yield ChatNormalResponse(step=Step.START_REPLY)

            # 4. 生成并发送回复
            complete_content = ChatStreamChunk(
                content="", reason_content=""
            )  # 用于累积完整内容, 注意函数调用不用缓存
            async for chunk in ChatService.generate_ai_reply(message):
                response = ChatProcessResponse(
                    step=Step.SEND
                )  # 这里不能直接拿chunk的content, 必须要完整累积
                if chunk.content:
                    complete_content.content += chunk.content
                    response.content = complete_content.content
                if chunk.reason_content:
                    complete_content.reason_content += chunk.reason_content
                    response.reason_content = complete_content.reason_content
                if chunk.tool_call_feedback:
                    response.tool_call_feedback = chunk.tool_call_feedback
                yield response

                # 5. 回复成功，返回完整内容
                yield ChatProcessResponse(step=Step.SUCCESS, content=complete_content)

            # 6. 流程结束
            yield ChatNormalResponse(step=Step.END)

        except Exception as e:
            logger.error(f"SSE 聊天处理失败: {str(e)}\n{traceback.format_exc()}")
            yield ChatNormalResponse(step=Step.FAILED)


# 创建服务实例
chat_service = ChatService()
