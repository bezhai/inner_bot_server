"""向后兼容层 - History Agent

重定向到 app.agents.domains.history.agent
"""

import warnings

warnings.warn(
    "app.agents.history.agent is deprecated. "
    "Please use app.agents.domains.history.agent instead.",
    DeprecationWarning,
    stacklevel=2,
)

from app.agents.domains.history.agent import search_history
from app.agents.tools.history import HISTORY_TOOLS

__all__ = ["search_history", "HISTORY_TOOLS"]
