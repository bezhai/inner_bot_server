"""Guard 模块

前置检测图，用于在进入主聊天流程前进行安全检测。
包含三个并行检测节点：
1. 关键词检测（快速，无 LLM）
2. 系统提示词注入检测（LLM）
3. 敏感政治话题检测（LLM）

支持 Langfuse trace 追踪
"""

from app.agents.guard.graph import create_guard_graph, guard_graph, run_guard
from app.agents.guard.state import BlockReason, GuardResult, GuardState

__all__ = [
    "create_guard_graph",
    "guard_graph",
    "run_guard",
    "GuardState",
    "GuardResult",
    "BlockReason",
]
