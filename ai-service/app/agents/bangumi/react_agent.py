"""
Bangumi ReAct Agent
使用LangGraph官方的create_react_agent，提供简单的字符串输入输出接口
"""

import logging

from langchain.messages import AIMessage, HumanMessage
from langchain.tools import tool

from app.agents.bangumi.tools import (
    get_character_persons,
    get_character_subjects,
    get_person_characters,
    get_person_subjects,
    get_subject_characters,
    get_subject_persons,
    search_characters,
    search_persons,
    search_subjects,
)
from app.agents.basic.agent import ChatAgent

logger = logging.getLogger(__name__)


# 定义可用的Bangumi工具
BANGUMI_TOOLS = [
    search_subjects,
    search_characters,
    get_subject_characters,
    get_subject_persons,
    search_persons,
    get_person_subjects,
    get_person_characters,
    get_character_persons,
    get_character_subjects,
]


@tool
async def bangumi_search(query: str) -> str:
    """
    通过Bangumi获取ACG相关信息

    Args:
        query: 一个明确的查询请求, 例如 "帮我查询进击的巨人里面有哪些角色"

    Returns:
        Bangumi返回的查询结果
    """
    try:
        # 获取agent
        agent = ChatAgent("bangumi", BANGUMI_TOOLS, model_id="grok-4-fast-reasoning")

        # 执行agent
        message = await agent.run([HumanMessage(content=query)])

        # 找到最后一条AI消息
        if isinstance(message, AIMessage) and message.content:
            content = message.content
            if isinstance(content, str):
                return content
            raise ValueError("AI消息内容不是字符串")

        return "抱歉，我无法处理您的请求。"

    except Exception as e:
        logger.error(f"Bangumi agent执行失败: {str(e)}")
        return f"抱歉，处理您的请求时出现错误: {str(e)}"
