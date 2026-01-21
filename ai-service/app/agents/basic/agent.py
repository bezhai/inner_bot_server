"""向后兼容层 - Agent

重定向到 app.agents.core.agent
"""

import warnings

warnings.warn(
    "app.agents.basic.agent is deprecated. "
    "Please use app.agents.core.agent instead.",
    DeprecationWarning,
    stacklevel=2,
)

from app.agents.core.agent import ChatAgent

__all__ = ["ChatAgent"]
