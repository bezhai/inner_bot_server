"""历史检索工具集"""

from app.agents.tools.history.members import list_group_members
from app.agents.tools.history.search import (
    search_group_history,
    search_messages,
    search_messages_semantic,
)

# 推荐使用的工具列表（新混合检索工具）
HISTORY_TOOLS = [search_group_history, list_group_members]

# 包含所有工具（含已废弃的旧工具，用于兼容）
HISTORY_TOOLS_ALL = [
    search_group_history,
    search_messages,
    search_messages_semantic,
    list_group_members,
]

__all__ = [
    "search_group_history",
    "search_messages",
    "search_messages_semantic",
    "list_group_members",
    "HISTORY_TOOLS",
    "HISTORY_TOOLS_ALL",
]
