import logging
from collections.abc import AsyncGenerator

from langchain_core.messages import AIMessageChunk, HumanMessage

from app.agents.basic import ChatAgent, load_memory
from app.agents.main.tools import MAIN_TOOLS
from app.types.chat import ChatStreamChunk
from app.utils.async_interval import AsyncIntervalChecker
from app.utils.status_processor import AIMessageChunkProcessor
from app.memory.l2_topic_service import get_active_topics
from app.memory.l3_consensus_service import search_relevant_consensus
from app.services.quick_search import quick_search

logger = logging.getLogger(__name__)

YIELD_INTERVAL = 0.5


async def stream_chat(message_id: str) -> AsyncGenerator[ChatStreamChunk, None]:
    agent = ChatAgent("gemini-2.5-flash-preview-09-2025", "main", MAIN_TOOLS)

    # L1: 使用 quick_search 拉取近期历史；仅提取简要文本
    l1_results = await quick_search(message_id=message_id, limit=15)
    recent_texts = []
    for r in l1_results:
        # 仅收集文本
        recent_texts.append(r.content)

    # 从第一条或最后一条获取 chat_id / group_id
    group_id = l1_results[-1].chat_id if l1_results else ""

    # L2: 活跃话题，拼接到单一 HumanMessage
    active_topics = await get_active_topics(group_id, hours=3) if group_id else []
    topics_summary = "\n".join([f"[{t.id}] {t.title}: {t.summary}" for t in active_topics])
    l1_summary = "\n".join(recent_texts)
    merged_user_content = (
        (f"[Active Topics]\n{topics_summary}\n\n" if topics_summary else "")
        + f"[Recent Messages]\n{l1_summary}"
    )

    messages = [HumanMessage(content=merged_user_content)]
    image_urls = []

    logger.info(f"Built merged single user message with L1+L2")

    accumulate_chunk = ChatStreamChunk(
        content="",
        reason_content="",
    )

    interval_checker = AsyncIntervalChecker(YIELD_INTERVAL)
    processor = AIMessageChunkProcessor()
    should_continue = True  # 控制是否继续处理和输出

    try:
        # L3: 共识注入到 system prompt 变量
        consensus_list = (
            await search_relevant_consensus(group_id, recent_texts[-1], k=3)
            if group_id and recent_texts
            else []
        )
        consensus_text = "\n".join(consensus_list)

        async for token in agent.stream(
            messages,
            context={
                "curr_message_id": message_id,
                "image_url_list": image_urls,
            },
            prompt_vars={"consensus": consensus_text},
        ):
            # 工具调用忽略
            if isinstance(token, AIMessageChunk):
                finish_reason = token.response_metadata.get("finish_reason")

                if finish_reason == "stop":
                    # 表明已经执行完毕
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
                # accumulate_chunk.reason_content += token.reason_content or ""

                if interval_checker.check():
                    # 发送消息最低间隔为0.5秒
                    yield accumulate_chunk

    except Exception as e:
        import traceback

        logger.error(f"stream_chat error: {str(e)}\n{traceback.format_exc()}")
        yield ChatStreamChunk(content="赤尾好像遇到了一些问题呢QAQ")
