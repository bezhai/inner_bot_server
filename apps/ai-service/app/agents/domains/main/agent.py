"""主聊天 Agent"""

import logging
from collections.abc import AsyncGenerator
from datetime import datetime

from langchain.messages import AIMessageChunk

from app.agents.core import ChatAgent, ContextSchema
from app.agents.domains.main.context_builder import build_chat_context
from app.agents.domains.main.tools import ALL_TOOLS
from app.agents.graphs.pre import Complexity, run_pre
from app.orm.crud import get_gray_config, get_message_content
from app.types.chat import ChatStreamChunk
from app.utils.async_interval import AsyncIntervalChecker
from app.utils.status_processor import AIMessageChunkProcessor

logger = logging.getLogger(__name__)

YIELD_INTERVAL = 0.5

# 统一的拒绝响应
GUARD_REJECT_MESSAGE = "你发了一些赤尾不想讨论的话题呢~"

# 复杂度行为引导
COMPLEXITY_HINTS = {
    Complexity.SIMPLE: "【简洁模式】倾向于直接回答或单次工具调用，快速响应用户。",
    Complexity.COMPLEX: "【深度模式】可以多步推理，充分利用工具收集信息后再综合回答。",
    Complexity.SUPER_COMPLEX: "【研究模式】这是一个复杂的研究任务，可以进行深入分析和多轮工具调用。",
}


async def stream_chat(message_id: str) -> AsyncGenerator[ChatStreamChunk, None]:
    """主聊天流式响应入口

    Args:
        message_id: 触发消息的 ID

    Yields:
        ChatStreamChunk: 聊天流式响应块
    """
    # 1. 获取消息内容
    message_content = await get_message_content(message_id)
    if not message_content:
        logger.warning(f"No message found for message_id: {message_id}")
        yield ChatStreamChunk(content="抱歉，未找到相关消息记录")
        return

    # 2. 运行 Pre Graph（安全检测 + 复杂度分类，并行执行）
    pre_result = await run_pre(message_content)

    # 3. 安全拦截
    if pre_result["is_blocked"]:
        logger.info(
            f"消息被拦截: message_id={message_id}, reason={pre_result['block_reason']}"
        )
        yield ChatStreamChunk(content=GUARD_REJECT_MESSAGE)
        return

    # 4. 获取复杂度分类结果
    complexity_result = pre_result["complexity_result"]
    if complexity_result is None:
        complexity = Complexity.SIMPLE
    else:
        complexity = complexity_result.complexity

    logger.info(f"复杂度路由: complexity={complexity.value}")

    # 5. 构建 prompt 变量（注入复杂度引导）
    now = datetime.now()
    prompt_vars = {
        "complexity_hint": COMPLEXITY_HINTS.get(complexity, ""),
        "curr_date": now.strftime("%Y-%m-%d"),
        "curr_time": now.strftime("%H:%M"),
    }

    # 6. 获取 gray_config
    gray_config = (await get_gray_config(message_id)) or {}

    # 7. 创建 agent（始终使用所有工具）
    model_id = "main-chat-model"
    if gray_config.get("main_model"):
        model_id = str(gray_config.get("main_model"))

    agent = ChatAgent(
        "main",
        ALL_TOOLS,
        model_id=model_id,
        trace_name="main",
    )

    # 8. 构建上下文
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
    should_continue = True

    try:
        async for token in agent.stream(
            messages,
            context=ContextSchema(
                curr_message_id=message_id,
                image_url_list=image_urls,
                gray_config=gray_config,
                curr_chat_id=chat_id,
            ),
            prompt_vars=prompt_vars,
        ):
            if isinstance(token, AIMessageChunk):
                finish_reason = token.response_metadata.get("finish_reason")

                if finish_reason == "stop":
                    yield accumulate_chunk
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

                accumulate_chunk.content += token.text or ""

                if interval_checker.check():
                    yield accumulate_chunk

    except Exception as e:
        import traceback

        logger.error(f"stream_chat error: {str(e)}\n{traceback.format_exc()}")
        yield ChatStreamChunk(content="赤尾好像遇到了一些问题呢QAQ")
