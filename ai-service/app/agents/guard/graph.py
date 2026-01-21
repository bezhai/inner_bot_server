"""Guard LangGraph 图定义

实现前置安全检测的 LangGraph 图，包含：
1. 关键词检测节点（快速，无 LLM）
2. 两个并行 LLM 检测节点（提示词注入、敏感政治）
3. 聚合节点
4. 条件路由（拦截或放行）

支持 Langfuse trace 追踪
"""

from typing import Literal

from langfuse.langchain import CallbackHandler
from langgraph.graph import END, START, StateGraph

from app.agents.guard.nodes import (
    aggregate_results,
    check_banned_word_node,
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
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
    ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
    │ banned_word │ │  prompt     │ │  politics   │
    │  (快速)     │ │  injection  │ │             │
    └──────┬──────┘ └──────┬──────┘ └──────┬──────┘
              │              │              │
              └──────────────┼──────────────┘
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
    builder.add_node("check_banned_word", check_banned_word_node)
    builder.add_node("check_prompt_injection", check_prompt_injection)
    builder.add_node("check_sensitive_politics", check_sensitive_politics)
    builder.add_node("aggregate", aggregate_results)

    # 从 START 并行分发到三个检测节点
    builder.add_edge(START, "check_banned_word")
    builder.add_edge(START, "check_prompt_injection")
    builder.add_edge(START, "check_sensitive_politics")

    # 三个检测节点都汇聚到 aggregate
    builder.add_edge("check_banned_word", "aggregate")
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


async def run_guard(message_content: str) -> GuardState:
    """运行 Guard 检测图，带 Langfuse trace

    Args:
        message_content: 待检测的消息内容

    Returns:
        GuardState: 检测结果状态
    """
    graph = create_guard_graph()

    # 创建带 Langfuse 追踪的配置
    config = {
        "callbacks": [CallbackHandler()],
        "run_name": "guard",
    }

    initial_state: GuardState = {
        "message_content": message_content,
        "check_results": [],
        "is_blocked": False,
        "block_reason": None,
    }

    result = await graph.ainvoke(initial_state, config=config)
    return result


# 保留单例图实例（用于不需要 trace 的场景）
guard_graph = create_guard_graph()
