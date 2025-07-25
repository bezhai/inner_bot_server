import logging
import traceback
from collections.abc import AsyncGenerator

from app.services.chat.context import MessageContext
from app.services.meta_info import AsyncRedisClient

# 使用新的工具系统
from app.tools import get_tool_manager
from app.types.chat import ChatStreamChunk

from .model import ModelService
from .prompt import ChatPromptService

logger = logging.getLogger(__name__)


class AIChatService:
    @staticmethod
    async def stream_ai_reply(
        message_id: str,
        model_id: str = "gpt-4o-mini",
        temperature: float = 0.7,
        enable_tools: bool = False,
        max_tool_iterations: int = 10,
    ) -> AsyncGenerator[ChatStreamChunk, None]:
        """
        生成AI回复的流式响应，支持工具调用和多轮对话

        Args:
            messages: 对话消息列表，包含用户输入和上下文
            model_id: 模型ID，默认为gpt-4o-mini
            temperature: 温度参数
            enable_tools: 是否启用工具调用
            max_tool_iterations: 最大工具调用迭代次数

        Yields:
            ChatStreamChunk: 流式响应数据块
        """
        # 获取Redis实例并加锁
        redis = AsyncRedisClient.get_instance()
        lock_key = f"msg_lock:{message_id}"

        try:
            # 加锁，过期时间60秒
            await redis.set(lock_key, "1", nx=True, ex=60)
            logger.info(f"消息锁定成功: {message_id}")
        except Exception as e:
            logger.warning(f"消息加锁失败: {message_id}, 错误: {str(e)}")

        try:
            prompt = await ChatPromptService.get_prompt({})
            message_context = MessageContext(message_id, lambda param: prompt)
            await message_context.init_context_messages()

            # 准备工具调用参数
            tools = None
            if enable_tools:
                try:
                    tool_manager = get_tool_manager()
                    tools = tool_manager.get_tools_schema()
                except RuntimeError:
                    # 工具系统未初始化，禁用工具
                    enable_tools = False

            # 获取流式响应并直接传递
            async for chunk in ModelService.chat_completion_stream(
                model_id=model_id,
                context=message_context,
                temperature=temperature,
                tools=tools,
                max_tool_iterations=max_tool_iterations,
            ):
                # 提取文本内容并直接输出
                if chunk.delta and chunk.delta.content:
                    yield ChatStreamChunk(
                        content=chunk.delta.content,
                        # reason_content=chunk.delta.reason_content if hasattr(chunk.delta, "reason_content") else None,
                    )

                # finish_reason包含四种结果, 除tool_calls外, 其他结果都表示完成
                if chunk.finish_reason:
                    logger.info(f"chunk.finish_reason: {chunk.finish_reason}")
                    # 如果是content_filter, 需要返回原因, 截断需要告知用户, tool_calls因为finish_reason不包含function name, 所以不处理
                    if chunk.finish_reason == "content_filter":
                        yield ChatStreamChunk(
                            content="赤尾有点不想讨论这个话题呢~",
                        )
                    elif chunk.finish_reason == "length":
                        yield ChatStreamChunk(
                            content="(后续内容被截断)",
                        )

                    # 除tool_calls外, 其他都需要中止
                    if chunk.finish_reason != "tool_calls":
                        break

        except Exception as e:
            # 如果出现错误，输出错误信息
            logger.error(f"生成回复时出现错误: {str(e)}\n{traceback.format_exc()}")
            yield ChatStreamChunk(content=f"生成回复时出现错误: {str(e)}")
        finally:
            # 解锁
            try:
                await redis.delete(lock_key)
                logger.info(f"消息解锁成功: {message_id}")
            except Exception as e:
                logger.warning(f"消息解锁失败: {message_id}, 错误: {str(e)}")
