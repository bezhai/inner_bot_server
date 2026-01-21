"""向后兼容层 - Context

重定向到 app.agents.core.context
"""

import warnings

warnings.warn(
    "app.agents.basic.context is deprecated. "
    "Please use app.agents.core.context instead.",
    DeprecationWarning,
    stacklevel=2,
)

from app.agents.core.context import (
    AgentContext,
    ContextSchema,
    FeatureFlags,
    MediaContext,
    MessageContext,
    UserContext,
)

__all__ = [
    "ContextSchema",
    "AgentContext",
    "MessageContext",
    "MediaContext",
    "UserContext",
    "FeatureFlags",
]
