"""向后兼容层 - Langfuse

重定向到 app.agents.infra.langfuse
"""

import warnings

warnings.warn(
    "app.agents.basic.langfuse is deprecated. "
    "Please use app.agents.infra.langfuse instead.",
    DeprecationWarning,
    stacklevel=2,
)

from app.agents.infra.langfuse import client, get_prompt

__all__ = ["client", "get_prompt"]
