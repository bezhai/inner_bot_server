"""历史检索 Agent

提供历史消息和群成员的智能检索能力
"""

import logging
from typing import Annotated

from langchain.messages import AIMessage, HumanMessage
from langchain.tools import tool
from langgraph.runtime import get_runtime
from pydantic import Field

from app.agents.basic.agent import ChatAgent
from app.agents.basic.context import ContextSchema
from app.agents.history.tools import (
    list_group_members,
    search_messages,
    search_messages_semantic,
)

logger = logging.getLogger(__name__)

# 历史检索工具集
HISTORY_TOOLS = [
    search_messages,  # 关键词检索
    search_messages_semantic,  # 语义检索（多模态）
    list_group_members,
]


@tool
async def search_history(
    query: Annotated[
        str,
        Field(description="自然语言描述的查询需求"),
    ],
) -> str:
    """
    搜索历史消息或群成员信息

    这是一个智能检索工具，能够理解自然语言查询意图，自动选择合适的检索策略。

    适用场景：
    - 用户提到"上次""之前""那次""最近"等时间词
    - 用户询问某人说过什么
    - 用户询问历史讨论/决策/结论
    - 用户询问群成员信息（如"这个群谁负责XX"）

    Args:
        query: 自然语言描述的查询需求

    Returns:
        str: 结构化的检索结果

    Examples:
        - "上次讨论API的记录"
        - "李四上周说了什么"
        - "最近关于数据库的讨论"
        - "这个群里有哪些人"
    """
    try:
        agent = ChatAgent(
            prompt_id="history_search",
            tools=HISTORY_TOOLS,
            model_id="search-history-model",
        )

        # 调用子 agent
        context = get_runtime(ContextSchema).context
        message = await agent.run(
            [HumanMessage(content=query)],  # type: ignore
            context=ContextSchema(
                curr_chat_id=context.curr_chat_id,
            ),
        )

        if isinstance(message, AIMessage) and message.content:
            return str(message.content)

        return "未找到相关历史记录"

    except Exception as e:
        logger.error(f"History search agent 执行失败: {str(e)}", exc_info=True)
        return f"历史检索时出现错误: {str(e)}"
