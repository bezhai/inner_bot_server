"""
聊天服务层
处理聊天相关的业务逻辑
"""

import asyncio
import logging
import traceback
from collections.abc import AsyncGenerator
from typing import Any

from app.services.chat.message import AIChatService, ContentFilterError
from app.services.chat.prompt import PromptGeneratorParam
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
    async def _handle_partial_response(
        messages: list[dict[str, Any]], accumulated_content: ChatStreamChunk
    ) -> None:
        """
        处理部分响应，将已生成的内容添加到消息列表中

        Args:
            messages: 消息列表
            accumulated_content: 累积的内容
        """
        if accumulated_content.content:
            messages.append(
                {
                    "role": "assistant",
                    "content": accumulated_content.content,
                    "partial": True,
                }
            )

    @staticmethod
    async def _stream_with_model(
        messages: list[dict[str, Any]],
        model_id: str,
        yield_interval: float,
        accumulated: ChatStreamChunk,
        last_yield_time: float,
    ) -> AsyncGenerator[ChatStreamChunk, None]:
        """
        使用指定模型进行流式回复生成

        Args:
            messages: 消息列表
            model_id: 模型ID
            yield_interval: 输出间隔时间
            accumulated_content: 累积的内容
            last_yield_time: 上次输出时间

        Yields:
            ChatStreamChunk: 生成的回复内容片段
        """
        async for chunk in AIChatService.stream_ai_reply(
            messages=messages,
            model_id=model_id,
            enable_tools=True,
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
                if accumulated.has_content():
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
        from app.services.chat.context import MessageContext
        from app.services.chat.prompt import ChatPromptService

        try:
            # 获取上下文消息
            prompt = await ChatPromptService.get_prompt({})
            message_context = MessageContext(message_id, lambda param: prompt)
            await message_context.init_context_messages()
            messages = message_context.build(PromptGeneratorParam())

            # 定义模型配置
            model_configs = [
                {"id": "302.ai/gpt-4.1", "name": "主模型"},
                {"id": "Moonshot/kimi-k2", "name": "备用模型"},
            ]

            accumulated_content = ChatStreamChunk(content="", reason_content="")
            last_yield_time = asyncio.get_event_loop().time()

            for i, model_config in enumerate(model_configs):
                try:
                    async for chunk in ChatService._stream_with_model(
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
                        await ChatService._handle_partial_response(
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
                        await ChatService._handle_partial_response(
                            messages, accumulated_content
                        )
                        last_yield_time = asyncio.get_event_loop().time()
                    else:
                        logger.error(f"所有模型都失败: {str(e)}")
                        raise

        except Exception as e:
            logger.error(f"生成AI回复时出错: {str(e)}\n{traceback.format_exc()}")
            yield ChatStreamChunk(content="赤尾好像遇到了一些问题呢QAQ")

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
