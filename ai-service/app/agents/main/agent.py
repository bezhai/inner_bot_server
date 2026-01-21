"""向后兼容层 - Main Agent

重定向到 app.agents.domains.main.agent
"""

import warnings

warnings.warn(
    "app.agents.main.agent is deprecated. "
    "Please use app.agents.domains.main.agent instead.",
    DeprecationWarning,
    stacklevel=2,
)

from app.agents.domains.main.agent import (
    GUARD_REJECT_MESSAGE,
    YIELD_INTERVAL,
    stream_chat,
)

__all__ = [
    "stream_chat",
    "YIELD_INTERVAL",
    "GUARD_REJECT_MESSAGE",
]
