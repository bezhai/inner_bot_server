"""向后兼容层 - Guard Graph

重定向到 app.agents.graphs.guard.graph
"""

import warnings

warnings.warn(
    "app.agents.guard.graph is deprecated. "
    "Please use app.agents.graphs.guard.graph instead.",
    DeprecationWarning,
    stacklevel=2,
)

from app.agents.graphs.guard.graph import (
    get_guard_graph,
    route_after_aggregate,
    run_guard,
)

# 保留旧命名
create_guard_graph = get_guard_graph
guard_graph = get_guard_graph()

__all__ = [
    "create_guard_graph",
    "guard_graph",
    "run_guard",
    "route_after_aggregate",
]
