"""Guard LangGraph 图定义

实现前置安全检测的 LangGraph 图，包含：
1. 两个并行检测节点（提示词注入、敏感政治）
2. 聚合节点
3. 条件路由（拦截或放行）
"""

from typing import Literal

from langgraph.graph import END, START, StateGraph

from app.agents.guard.nodes import (
    aggregate_results,
    check_prompt_injection,
    check_sensitive_politics,
)
from app.agents.guard.state import GuardState


def route_after_aggregate(state: GuardState) -> Literal["reject", "pass"]:
    """根据聚合结果决定路由"""
    if state["is_blocked"]:
        return "reject"
    return "pass"


def create_guard_graph():
    """创建 Guard 检测图

    图结构：
                    ┌─────────────────┐
                    │     START       │
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
              ▼                             ▼
    ┌─────────────────┐           ┌─────────────────┐
    │ check_prompt    │           │ check_politics  │
    │ _injection      │           │                 │
    └────────┬────────┘           └────────┬────────┘
              │                             │
              └──────────────┬──────────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │   aggregate     │
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
              ▼                             ▼
         [reject]                       [pass]
              │                             │
              ▼                             ▼
             END                           END

    Returns:
        编译后的 StateGraph
    """
    builder = StateGraph(GuardState)

    # 添加节点
    builder.add_node("check_prompt_injection", check_prompt_injection)
    builder.add_node("check_sensitive_politics", check_sensitive_politics)
    builder.add_node("aggregate", aggregate_results)

    # 从 START 并行分发到两个检测节点
    builder.add_edge(START, "check_prompt_injection")
    builder.add_edge(START, "check_sensitive_politics")

    # 两个检测节点都汇聚到 aggregate
    builder.add_edge("check_prompt_injection", "aggregate")
    builder.add_edge("check_sensitive_politics", "aggregate")

    # aggregate 之后根据结果路由
    builder.add_conditional_edges(
        "aggregate",
        route_after_aggregate,
        {
            "reject": END,
            "pass": END,
        },
    )

    return builder.compile()


# 创建单例图实例
guard_graph = create_guard_graph()
