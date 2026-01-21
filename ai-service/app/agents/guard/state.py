"""向后兼容层 - Guard State

重定向到 app.agents.graphs.guard.state
"""

import warnings

warnings.warn(
    "app.agents.guard.state is deprecated. "
    "Please use app.agents.graphs.guard.state instead.",
    DeprecationWarning,
    stacklevel=2,
)

from app.agents.graphs.guard.state import (
    BlockReason,
    GuardResult,
    GuardState,
    merge_results,
)

__all__ = [
    "BlockReason",
    "GuardResult",
    "merge_results",
    "GuardState",
]
