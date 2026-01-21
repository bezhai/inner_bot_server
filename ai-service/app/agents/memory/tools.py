"""向后兼容层 - Memory Tools

重定向到 app.agents.tools.memory
"""

import warnings

warnings.warn(
    "app.agents.memory.tools is deprecated. "
    "Please use app.agents.tools.memory instead.",
    DeprecationWarning,
    stacklevel=2,
)

from app.agents.tools.memory import (
    PROFILE_TOOLS,
    UserProfileUpdateItem,
    get_profiles,
    update_profiles,
)

__all__ = [
    "get_profiles",
    "update_profiles",
    "PROFILE_TOOLS",
    "UserProfileUpdateItem",
]
