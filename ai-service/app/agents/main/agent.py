import logging
from collections.abc import AsyncGenerator

from langchain.messages import AIMessageChunk, HumanMessage

from app.agents.basic import ChatAgent
from app.agents.basic.context import ContextSchema
from app.agents.basic.langfuse import get_prompt
from app.agents.main.context_builder import build_chat_context
from app.agents.main.tools import MAIN_TOOLS
from app.types.chat import ChatStreamChunk
from app.utils.async_interval import AsyncIntervalChecker
from app.utils.status_processor import AIMessageChunkProcessor

logger = logging.getLogger(__name__)

YIELD_INTERVAL = 0.5


async def stream_chat(message_id: str) -> AsyncGenerator[ChatStreamChunk, None]:
    agent = ChatAgent("gemini-2.5-flash-preview-09-2025", "main", MAIN_TOOLS)

    # 使用统一的上下文构建接口
    context = await build_chat_context(message_id)

    if context is None:
        logger.warning(f"No results found for message_id: {message_id}")
        yield ChatStreamChunk(content="抱歉，未找到相关消息记录")
        return

    user_content = get_prompt("context_builder", label=context.chat_type).compile(
        group_name=context.chat_name,
        chat_history=context.chat_history,
        trigger_content=context.trigger_content,
        trigger_username=context.trigger_username,
    )

    # 构建多模态 LangChain 消息
    content_blocks = [{"type": "text", "text": user_content}]

    # 追加图片
    for url in context.image_urls:
        content_blocks.append({"type": "image", "url": url})

    messages = [HumanMessage(content_blocks=content_blocks)]

    accumulate_chunk = ChatStreamChunk(
        content="",
        reason_content="",
    )

    interval_checker = AsyncIntervalChecker(YIELD_INTERVAL)
    processor = AIMessageChunkProcessor()
    should_continue = True  # 控制是否继续处理和输出

    try:
        async for token in agent.stream(
            messages,
            context=ContextSchema(
                curr_message_id=message_id,
                image_url_list=context.image_urls,
            ),
        ):
            # 工具调用忽略
            if isinstance(token, AIMessageChunk):
                finish_reason = token.response_metadata.get("finish_reason")

                if finish_reason == "stop":
                    # 表明已经执行完毕
                    yield accumulate_chunk
                    # should_continue = False
                    # 太傻逼了, google 模型就喜欢搞这种骚操作, 非要在tool_calls之后加stop
                elif finish_reason == "content_filter":
                    yield ChatStreamChunk(content="小尾有点不想讨论这个话题呢~")
                    should_continue = False
                elif finish_reason == "length":
                    yield ChatStreamChunk(content="(后续内容被截断)")
                    should_continue = False

                if not should_continue:
                    continue

                status_message = processor.process_chunk(token)
                if status_message:
                    yield ChatStreamChunk(status_message=status_message)

                accumulate_chunk.content += token.content or ""  # type: ignore
                # accumulate_chunk.reason_content += token.reason_content or ""

                if interval_checker.check():
                    # 发送消息最低间隔为0.5秒
                    yield accumulate_chunk

    except Exception as e:
        import traceback

        logger.error(f"stream_chat error: {str(e)}\n{traceback.format_exc()}")
        yield ChatStreamChunk(content="赤尾好像遇到了一些问题呢QAQ")
