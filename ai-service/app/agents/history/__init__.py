"""向后兼容层 - History

重定向到 app.agents.domains.history
"""

import warnings

warnings.warn(
    "app.agents.history is deprecated. "
    "Please use app.agents.domains.history instead.",
    DeprecationWarning,
    stacklevel=2,
)
