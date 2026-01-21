"""搜索工具集"""

from app.agents.tools.search.allcpp import search_donjin_event
from app.agents.tools.search.web import search_web

# 基础搜索工具集合
SEARCH_TOOLS = [
    search_web,
    search_donjin_event,
]

__all__ = [
    "search_web",
    "search_donjin_event",
    "SEARCH_TOOLS",
]
