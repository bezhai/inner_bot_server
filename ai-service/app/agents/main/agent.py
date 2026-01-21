import logging
from collections.abc import AsyncGenerator

from langchain.messages import AIMessageChunk

from app.agents.basic import ChatAgent
from app.agents.basic.context import ContextSchema
from app.agents.guard import run_guard
from app.agents.main.context_builder import build_chat_context
from app.agents.main.tools import MAIN_TOOLS
from app.orm.crud import get_gray_config, get_message_content
from app.types.chat import ChatStreamChunk
from app.utils.async_interval import AsyncIntervalChecker
from app.utils.status_processor import AIMessageChunkProcessor

logger = logging.getLogger(__name__)

YIELD_INTERVAL = 0.5

# 统一的拒绝响应
GUARD_REJECT_MESSAGE = "你发了一些赤尾不想讨论的话题呢~"


async def stream_chat(message_id: str) -> AsyncGenerator[ChatStreamChunk, None]:
    # 1. 获取消息内容用于 guard 检测
    message_content = await get_message_content(message_id)
    if not message_content:
        logger.warning(f"No message found for message_id: {message_id}")
        yield ChatStreamChunk(content="抱歉，未找到相关消息记录")
        return

    # 2. 运行 guard graph 进行前置检测（带 Langfuse trace）
    guard_result = await run_guard(message_content)

    if guard_result["is_blocked"]:
        logger.info(
            f"消息被 guard 拦截: message_id={message_id}, "
            f"reason={guard_result['block_reason']}"
        )
        yield ChatStreamChunk(content=GUARD_REJECT_MESSAGE)
        return

    # 获取 gray_config
    gray_config = (await get_gray_config(message_id)) or {}
    # 3. 创建 agent

    model_id = "main-chat-model"
    if gray_config.get("main_model"):
        model_id = str(gray_config.get("main_model"))

    agent = ChatAgent(
        "main",
        MAIN_TOOLS,
        model_id=model_id,
        trace_name="main",
    )

    # 4. 构建上下文
    messages, image_urls, chat_id = await build_chat_context(message_id)

    if not messages:
        logger.warning(f"No results found for message_id: {message_id}")
        yield ChatStreamChunk(content="抱歉，未找到相关消息记录")
        return

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
                image_url_list=image_urls,
                gray_config=gray_config,
                curr_chat_id=chat_id,
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
