"""向后兼容层 - Search Agent

重定向到 app.agents.domains.search.agent
"""

import warnings

warnings.warn(
    "app.agents.search.agent is deprecated. "
    "Please use app.agents.domains.search.agent instead.",
    DeprecationWarning,
    stacklevel=2,
)

from app.agents.domains.search.agent import unified_search
from app.agents.tools.search import SEARCH_TOOLS

__all__ = ["unified_search", "SEARCH_TOOLS"]
