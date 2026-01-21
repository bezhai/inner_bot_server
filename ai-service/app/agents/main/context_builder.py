"""向后兼容层 - Main Context Builder

重定向到 app.agents.domains.main.context_builder
"""

import warnings

warnings.warn(
    "app.agents.main.context_builder is deprecated. "
    "Please use app.agents.domains.main.context_builder instead.",
    DeprecationWarning,
    stacklevel=2,
)

from app.agents.domains.main.context_builder import (
    ChatContext,
    build_chat_context,
)

__all__ = [
    "build_chat_context",
    "ChatContext",
]
