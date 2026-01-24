"""工具层

提供 Agent 可调用的工具集合。
"""

from app.agents.tools.decorators import tool_error_handler

# 从各子模块导出工具
from app.agents.tools.history import (
    HISTORY_TOOLS,
    list_group_members,
    search_messages,
    search_messages_semantic,
)
from app.agents.tools.image import generate_image
from app.agents.tools.memory import PROFILE_TOOLS, get_profiles, update_profiles
from app.agents.tools.search import (
    SEARCH_TOOLS,
    search_donjin_event,
    search_web,
)

# Main 工具集（包含所有顶层工具）
MAIN_TOOLS = [
    # 统一搜索入口（整合 web、同人展搜索）
    # unified_search 作为 agent 级工具，从 domains 导入
    generate_image,  # 图片生成
    # search_history 作为 agent 级工具，从 domains 导入
]

__all__ = [
    # Decorators
    "tool_error_handler",
    # Search tools
    "SEARCH_TOOLS",
    "search_web",
    "search_donjin_event",
    # History tools
    "HISTORY_TOOLS",
    "search_messages",
    "search_messages_semantic",
    "list_group_members",
    # Image tools
    "generate_image",
    # Memory tools
    "PROFILE_TOOLS",
    "get_profiles",
    "update_profiles",
    # Main tools
    "MAIN_TOOLS",
]
