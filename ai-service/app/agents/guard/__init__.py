"""向后兼容层 - Guard

重定向到 app.agents.graphs.guard
"""

import warnings

warnings.warn(
    "app.agents.guard is deprecated. "
    "Please use app.agents.graphs.guard instead.",
    DeprecationWarning,
    stacklevel=2,
)

from app.agents.graphs.guard import (
    BlockReason,
    GuardResult,
    GuardState,
    get_guard_graph,
    run_guard,
)

# 保留旧的命名用于兼容性
guard_graph = get_guard_graph()
create_guard_graph = get_guard_graph

__all__ = [
    "create_guard_graph",
    "guard_graph",
    "run_guard",
    "GuardState",
    "GuardResult",
    "BlockReason",
]
