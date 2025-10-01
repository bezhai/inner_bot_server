import logging
from collections.abc import AsyncGenerator

from langchain_core.messages import AIMessageChunk, HumanMessage

from app.agents.basic import ChatAgent, load_memory
from app.types.chat import ChatStreamChunk
from app.utils.async_interval import AsyncIntervalChecker
from app.utils.status_processor import AIMessageChunkProcessor
from app.agents.main.graph.graph import run_routing
from app.agents.main import config

logger = logging.getLogger(__name__)

YIELD_INTERVAL = 0.5


    


async def stream_chat(message_id: str) -> AsyncGenerator[ChatStreamChunk, None]:
    """主入口：用 LangGraph 路由图进行分类与中间处理，再由 normal chat 流式输出。"""

    messages, image_urls = await load_memory(message_id)
    logger.info(f"Loaded {len(messages)} messages and {len(image_urls or [])} images")

    # 通过路由图得到分类与中间结果
    route_state = await run_routing(messages, {
        "curr_message_id": message_id,
        "image_url_list": image_urls,
    })

    # 敏感直接拒绝（一次性输出）
    if route_state.is_sensitive:
        reject_text = route_state.reject_text or "小尾有点不想讨论这个话题呢~"
        yield ChatStreamChunk(content=reject_text)
        return

    # 将中间结果注入 normal chat 并流式输出
    try:
        normal_agent = ChatAgent(config.NORMAL_MODEL, config.NORMAL_PROMPT, config.NORMAL_TOOLS)

        # 将中间结果注入为额外的人类消息，确保 persona 由 normal chat 控制
        augmented_messages = list(messages)
        if route_state.intermediate_text:
            augmented_messages.append(
                HumanMessage(
                    content=(
                        "[系统中间结果，仅供参考，不要直接复述原文]"\
                        "\n" + route_state.intermediate_text
                    )
                )
            )

        accumulate_chunk = ChatStreamChunk(
            content="",
            reason_content="",
        )
        interval_checker = AsyncIntervalChecker(YIELD_INTERVAL)
        processor = AIMessageChunkProcessor()
        should_continue = True

        async for token in normal_agent.stream(
            augmented_messages,
            context={
                "curr_message_id": message_id,
                "image_url_list": image_urls,
            },
        ):
            if isinstance(token, AIMessageChunk):
                finish_reason = token.response_metadata.get("finish_reason")

                if finish_reason == "stop":
                    yield accumulate_chunk
                    should_continue = False
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

                if interval_checker.check():
                    yield accumulate_chunk

    except Exception as e:
        import traceback
        logger.error(f"stream_chat error: {str(e)}\n{traceback.format_exc()}")
        yield ChatStreamChunk(content="赤尾好像遇到了一些问题呢QAQ")
