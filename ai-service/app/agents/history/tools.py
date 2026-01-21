"""向后兼容层 - History Tools

重定向到 app.agents.tools.history
"""

import warnings

warnings.warn(
    "app.agents.history.tools is deprecated. "
    "Please use app.agents.tools.history instead.",
    DeprecationWarning,
    stacklevel=2,
)

from app.agents.tools.history import (
    HISTORY_TOOLS,
    list_group_members,
    search_messages,
    search_messages_semantic,
)

__all__ = [
    "search_messages",
    "search_messages_semantic",
    "list_group_members",
    "HISTORY_TOOLS",
]
