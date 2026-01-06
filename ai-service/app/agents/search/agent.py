"""统一搜索 Agent"""

import logging

from langchain.messages import AIMessage, HumanMessage
from langchain.tools import tool

from app.agents.basic.agent import ChatAgent
from app.agents.search.tools import (
    get_character_persons,
    get_character_subjects,
    get_person_characters,
    get_person_subjects,
    get_subject_characters,
    get_subject_persons,
    get_subject_relations,
    search_characters,
    search_donjin_event,
    search_persons,
    search_subjects,
    search_web,
)

logger = logging.getLogger(__name__)

# 所有搜索工具的集合
SEARCH_TOOLS = [
    # Web 搜索
    search_web,
    # 同人展搜索
    search_donjin_event,
    # Bangumi 搜索工具
    search_subjects,
    search_characters,
    search_persons,
    get_subject_characters,
    get_subject_persons,
    get_subject_relations,
    get_character_subjects,
    get_character_persons,
    get_person_characters,
    get_person_subjects,
]


@tool
async def unified_search(query: str) -> str:
    """
    统一搜索接口，整合多种搜索能力（网络搜索、同人展查询、ACG数据库）

    该工具会智能分析查询意图，自动选择最合适的搜索工具，支持复杂的多步查询。

    Args:
        query: 搜索查询内容，用自然语言描述需求

    Returns:
        搜索结果的结构化信息
    """
    try:
        # 使用 search agent 智能选择合适的搜索工具
        agent = ChatAgent(
            "search",  # 在 Langfuse 中配置对应的 prompt
            SEARCH_TOOLS,
            model_id="search-model",  # 使用快速模型
            trace_name="search",
        )

        message = await agent.run([HumanMessage(content=query)])

        if isinstance(message, AIMessage) and message.content:
            return str(message.content)

        return "未找到相关搜索结果"

    except Exception as e:
        logger.error(f"Search agent 执行失败: {str(e)}")
        return f"搜索时出现错误: {str(e)}"
