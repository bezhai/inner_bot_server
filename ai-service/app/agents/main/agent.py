import logging
from collections.abc import AsyncGenerator

from langchain_core.messages import AIMessageChunk, HumanMessage

from app.agents.basic import ChatAgent
from app.agents.main.tools import MAIN_TOOLS
from app.services.quick_search import QuickSearchResult, quick_search
from app.types.chat import ChatStreamChunk
from app.utils.async_interval import AsyncIntervalChecker
from app.utils.status_processor import AIMessageChunkProcessor

logger = logging.getLogger(__name__)

YIELD_INTERVAL = 0.5


def format_chat_message(msg: QuickSearchResult, is_trigger: bool = False) -> str:
    """格式化单条聊天消息

    Args:
        msg: 消息对象
        is_trigger: 是否为触发消息

    Returns:
        格式化后的消息字符串
    """
    time_str = msg.create_time.strftime("%Y-%m-%d %H:%M:%S")
    username = msg.username or "未知用户"
    trigger_mark = " <<<--- [TRIGGER]" if is_trigger else ""

    return f"[{time_str}] [ID: {msg.message_id}] [User: {username}]: {msg.content}{trigger_mark}"


def build_chat_history(messages: list[QuickSearchResult], trigger_id: str) -> str:
    """构建格式化的聊天历史

    Args:
        messages: 消息列表
        trigger_id: 触发消息的ID

    Returns:
        格式化后的聊天历史字符串
    """
    formatted = []
    for msg in messages:
        is_trigger = msg.message_id == trigger_id
        formatted.append(format_chat_message(msg, is_trigger))

    return "\n".join(formatted)


async def stream_chat(message_id: str) -> AsyncGenerator[ChatStreamChunk, None]:
    agent = ChatAgent("gemini-2.5-flash-preview-09-2025", "main", MAIN_TOOLS)

    # L1: 使用 quick_search 拉取近期历史
    l1_results = await quick_search(message_id=message_id, limit=10)

    # 如果没有结果，直接返回
    if not l1_results:
        logger.warning(f"No results found for message_id: {message_id}")
        yield ChatStreamChunk(content="抱歉，未找到相关消息记录")
        return

    # 从最后一条获取 chat_id / group_id
    # group_id = l1_results[-1].chat_id

    # L2: 获取活跃话题并格式化
    # active_topics = await get_active_topics(group_id, hours=3) if group_id else []
    # topics_summary = "\n".join([
    #     f"- 话题: {t.title}\n  - 摘要: {t.summary}"
    #     for t in active_topics
    # ]) if active_topics else "（暂无近期话题）"

    # L3: 获取共识并格式化
    # consensus_list = (
    #     await search_relevant_consensus(group_id, l1_results[-1].content, k=3)
    #     if group_id
    #     else []
    # )
    # consensus_markdown = "\n".join(consensus_list) if consensus_list else "（暂无共识记录）"

    # 格式化聊天历史
    chat_history = build_chat_history(l1_results, message_id)

    # 找到触发消息的用户名
    trigger_username = next(
        (msg.username for msg in l1_results if msg.message_id == message_id), "未知用户"
    )

    # 构建结构化的用户消息内容
    # TODO: 增加背景信息
    """
    ## 1. 核心共识
{consensus_markdown}

## 2. 近期话题摘要
{topics_summary}
    """

    user_content = f"""# 近期聊天记录
这是最新的聊天记录。你被提及的消息已被标记为 <<<--- [TRIGGER]

{chat_history}

---

# 你的任务
请按照你的人设，根据上面提供的聊天记录，针对被 <<<--- [TRIGGER] 标记的消息，生成一条直接的、完整的回复。回复的提问者是 **{trigger_username}**。
"""

    messages = [HumanMessage(content=user_content)]
    image_urls = []

    logger.info(
        f"Built structured user message with L1+L2+L3 for message_id: {message_id}"
    )

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
            context={
                "curr_message_id": message_id,
                "image_url_list": image_urls,
            },
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
