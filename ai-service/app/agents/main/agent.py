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

# 私聊提示词模板
PRIVATE_CHAT_CONTEXT_TEMPLATE = """# 1. 对话背景
这是你与用户 **{trigger_username}** 的私聊对话。

# 2. 近期聊天记录（上下文）
以下是最近的聊天记录，供你了解当前对话的背景：

{chat_history}

---

# 3. 需要回复的消息
{trigger_content}

---

# 4. 你的任务
请按照你的人设，根据上面提供的聊天上下文，针对用户 **{trigger_username}** 的消息，生成一条直接的、完整的回复。
"""

# 群聊提示词模板
GROUP_CHAT_CONTEXT_TEMPLATE = """# 1. 对话背景
这是群聊「**{group_name}**」中的对话，当前有多位成员参与讨论。

# 2. 近期聊天记录（上下文）
以下是最近的聊天记录，供你了解当前对话的背景：

{chat_history}

---

# 3. 需要回复的消息
{trigger_content}

---

# 4. 你的任务
请按照你的人设，根据上面提供的聊天上下文，针对用户 **{trigger_username}** 的消息，生成一条直接的、完整的回复。
注意：这是群聊环境，回复时要考虑多人在场的社交场景，保持话题的连贯性。
"""


def format_chat_message(msg: QuickSearchResult) -> str:
    """格式化单条聊天消息

    Args:
        msg: 消息对象

    Returns:
        格式化后的消息字符串
    """
    time_str = msg.create_time.strftime("%Y-%m-%d %H:%M:%S")
    username = msg.username or "未知用户"

    return f"[{time_str}] [User: {username}]: {msg.content}"


def build_chat_context(
    messages: list[QuickSearchResult], trigger_id: str
) -> tuple[str, str, str, str, str | None]:
    """构建聊天上下文和触发消息

    Args:
        messages: 消息列表
        trigger_id: 触发消息的ID

    Returns:
        元组：(聊天历史, 格式化的触发消息, 触发用户名, 聊天类型, 群聊名称)
    """
    history_messages = []
    trigger_msg = None
    trigger_username = "未知用户"
    chat_type = "p2p"  # 默认私聊
    chat_name = None

    for msg in messages:
        if msg.message_id == trigger_id:
            trigger_msg = msg
            trigger_username = msg.username or "未知用户"
            chat_type = msg.chat_type or "p2p"
            chat_name = msg.chat_name
        else:
            history_messages.append(format_chat_message(msg))

    chat_history = (
        "\n".join(history_messages) if history_messages else "（暂无历史记录）"
    )
    trigger_formatted = (
        format_chat_message(trigger_msg) if trigger_msg else "（未找到触发消息）"
    )

    return chat_history, trigger_formatted, trigger_username, chat_type, chat_name


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

    # 构建聊天上下文和触发消息
    chat_history, trigger_content, trigger_username, chat_type, chat_name = (
        build_chat_context(l1_results, message_id)
    )

    # 构建结构化的用户消息内容
    # TODO: 增加背景信息
    """
    ## 1. 核心共识
{consensus_markdown}

## 2. 近期话题摘要
{topics_summary}
    """

    # 根据聊天类型选择不同的提示词模板
    if chat_type == "group" and chat_name:
        user_content = GROUP_CHAT_CONTEXT_TEMPLATE.format(
            group_name=chat_name,
            chat_history=chat_history,
            trigger_content=trigger_content,
            trigger_username=trigger_username,
        )
    else:
        user_content = PRIVATE_CHAT_CONTEXT_TEMPLATE.format(
            trigger_username=trigger_username,
            chat_history=chat_history,
            trigger_content=trigger_content,
        )

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
