"""向后兼容层 - Search

重定向到 app.agents.domains.search
"""

import warnings

warnings.warn(
    "app.agents.search is deprecated. "
    "Please use app.agents.domains.search instead.",
    DeprecationWarning,
    stacklevel=2,
)

from app.agents.domains.search.agent import unified_search

__all__ = ["unified_search"]
