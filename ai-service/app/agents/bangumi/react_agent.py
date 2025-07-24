"""
Bangumi ReAct Agent
使用LangGraph官方的create_react_agent，提供简单的字符串输入输出接口
"""

import logging
import asyncio
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langgraph.prebuilt import create_react_agent

from app.agents.bangumi.tools import (
    search_subjects,
    search_characters,
    get_subject_characters,
    get_subject_persons,
)
from app.langgraph_infra import ModelBuilder
from app.tools import tool

logger = logging.getLogger(__name__)

# Bangumi Agent的系统提示
BANGUMI_SYSTEM_PROMPT = """你是一个Bangumi数据查询代理，负责从Bangumi API获取客观、准确的条目信息，供上层系统使用。

你的核心任务：
1. 根据查询需求，使用合适的工具获取Bangumi条目数据
2. 需要更多信息时，可以多次使用工具获取
3. 整理和结构化返回的数据信息
4. 提供完整、客观的事实性信息，不添加主观评价

工具使用原则：
1. 优先使用精确的搜索参数，对于明确的查询建议设置较小的limit值（3-5）,除非非常确定结果只有一组，否则不要设置limit为1
2. 当需要详细信息时，先通过search_*工具获取ID，再使用get_subject_*工具获取更多关联信息
3. 利用筛选参数（types、tags、日期范围、评分范围）提高搜索精度
4. 当条目搜索结果和查询要求不符时，进行反思调整, 可以适当调整搜索参数（如limit、types、tags）来获取更多样的结果

输出要求：
- 返回结构化的客观数据
- 包含完整的信息（名称、类型、评分、标签、简介等）
- 条目、角色、人物等介绍优先使用简体中文名，剧情介绍等如果是其他语言尽量翻译成简体中文
- 如有多个结果，按相关性列出
- 不添加主观判断或推荐语言"""

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
        # 构建模型
        model = await ModelBuilder.build_chat_model("gpt-4o-mini")
        
        _agent = create_react_agent(
            model, 
            BANGUMI_TOOLS,
            prompt=BANGUMI_SYSTEM_PROMPT
        )
    
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
