"""Guard 模块

前置检测图，用于在进入主聊天流程前进行安全检测。
包含两个并行检测节点：
1. 系统提示词注入检测
2. 敏感政治话题检测
"""

from app.agents.guard.graph import create_guard_graph, guard_graph
from app.agents.guard.state import GuardResult, GuardState

__all__ = ["create_guard_graph", "guard_graph", "GuardState", "GuardResult"]
