"""
Bangumi ReAct Agent
使用LangGraph官方的create_react_agent，提供简单的字符串输入输出接口
"""

import logging

from langchain_core.messages import AIMessage, HumanMessage
from langgraph.prebuilt import create_react_agent

from app.agents.bangumi.tools import (
    get_subject_characters,
    get_subject_persons,
    search_characters,
    search_subjects,
)
from app.langgraph_infra import ModelBuilder
from app.services.prompt_service import PromptService
from app.tools import tool

logger = logging.getLogger(__name__)


# 定义可用的Bangumi工具
BANGUMI_TOOLS = [
    search_subjects,
    search_characters,
    get_subject_characters,
    get_subject_persons,
]

# 全局agent实例
_agent = None


async def _get_agent():
    """获取或创建agent实例"""
    global _agent
    if _agent is None:
        # 从数据库获取Bangumi提示词
        prompt_content = await PromptService.get_prompt("bangumi")
        if not prompt_content:
            raise ValueError("未找到Bangumi提示词(id='bangumi')")

        # 构建模型
        model = await ModelBuilder.build_chat_model("gpt-4.1-mini")

        _agent = create_react_agent(model, BANGUMI_TOOLS, prompt=prompt_content)

    return _agent


@tool()
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
        agent = await _get_agent()

        # 执行agent
        result = await agent.ainvoke({"messages": [HumanMessage(content=query)]})

        # 提取最后一条AI消息
        messages = result.get("messages", [])

        # 找到最后一条AI消息
        for message in reversed(messages):
            if isinstance(message, AIMessage) and message.content:
                return message.content

        return "抱歉，我无法处理您的请求。"

    except Exception as e:
        logger.error(f"Bangumi agent执行失败: {str(e)}")
        return f"抱歉，处理您的请求时出现错误: {str(e)}"
