"""向后兼容层 - Main Tools

重定向到 app.agents.domains.main.tools
"""

import warnings

warnings.warn(
    "app.agents.main.tools is deprecated. "
    "Please use app.agents.domains.main.tools instead.",
    DeprecationWarning,
    stacklevel=2,
)

from app.agents.domains.main.tools import MAIN_TOOLS

__all__ = ["MAIN_TOOLS"]
