"""统一搜索 Agent"""

import logging

from langchain.messages import AIMessage, HumanMessage
from langchain.tools import tool
from langchain_core.runnables import RunnableConfig

from app.agents.basic.agent import ChatAgent
from app.agents.search.tools import (
    search_donjin_event,
    search_web,
)

logger = logging.getLogger(__name__)

# 所有搜索工具的集合
SEARCH_TOOLS = [
    # Web 搜索
    search_web,
    # 同人展搜索
    search_donjin_event,
]


@tool
async def unified_search(query: str, config: RunnableConfig) -> str:
    """
    统一搜索接口，整合多种搜索能力（网络搜索、同人展查询）

    该工具会智能分析查询意图，��动选择最合适的搜索工具，支持复杂的多步查询。

    Args:
        query: 搜索查询内容，用自然语言描述需求

    Returns:
        搜索结果的结构化信息
    """
    try:
        agent = ChatAgent(
            "search",
            SEARCH_TOOLS,
            model_id="search-model",
        )

        # 传递父级 config，保持 trace 链路
        message = await agent.run([HumanMessage(content=query)], config=config)

        if isinstance(message, AIMessage) and message.content:
            return str(message.content)

        return "未找到相关搜索结果"

    except Exception as e:
        logger.error(f"Search agent 执行失败: {str(e)}")
        return f"搜索时出现错误: {str(e)}"
