"""
工具标签使用示例
展示如何使用新的 tagged_tool 装饰器为工具添加标签
"""

from .adapters.tool import tagged_tool, ToolTag


@tagged_tool([ToolTag.BANGUMI, ToolTag.SEARCH])
async def search_anime(query: str) -> str:
    """
    搜索动漫信息
    
    Args:
        query: 搜索关键词
    
    Returns:
        搜索结果
    """
    return f"搜索动漫: {query}"


@tagged_tool([ToolTag.BANGUMI, ToolTag.ANALYSIS])
async def analyze_character(character_name: str) -> str:
    """
    分析动漫角色
    
    Args:
        character_name: 角色名称
    
    Returns:
        角色分析结果
    """
    return f"分析角色: {character_name}"


@tagged_tool([ToolTag.WEB, ToolTag.SEARCH])
async def web_search(query: str) -> str:
    """
    网络搜索
    
    Args:
        query: 搜索关键词
    
    Returns:
        搜索结果
    """
    return f"网络搜索: {query}"


@tagged_tool([ToolTag.SYSTEM, ToolTag.DEBUG])
async def debug_tool(message: str) -> str:
    """
    调试工具
    
    Args:
        message: 调试信息
    
    Returns:
        调试输出
    """
    return f"DEBUG: {message}"


# 使用现有的 @tool 装饰器的工具会自动推断标签
from app.tools import tool

@tool()
async def bangumi_related_tool(query: str) -> str:
    """
    这个工具名称包含 bangumi，会自动推断为 BANGUMI 标签
    
    Args:
        query: 查询内容
    
    Returns:
        查询结果
    """
    return f"Bangumi tool result: {query}"