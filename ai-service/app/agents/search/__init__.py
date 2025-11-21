"""统一搜索 Agent 模块

提供统一的搜索入口，整合多种搜索源：
- Web 搜索 (Google)
- 同人展搜索 (allcpp)
- ACG 数据库搜索 (Bangumi)
"""

from .agent import unified_search

__all__ = [
    "unified_search",
]
