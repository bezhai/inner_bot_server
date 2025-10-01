from __future__ import annotations

import logging

from langgraph.graph import END, StateGraph
from langchain_core.messages import AIMessage, HumanMessage

from app.agents.basic import ChatAgent
from app.agents.main import config
from app.agents.main.graph.state import RouteState
from app.agents.main.graph import nodes


logger = logging.getLogger(__name__)


def build_routing_graph() -> StateGraph[RouteState]:
    graph = StateGraph(RouteState)

    async def on_enter_extract(state: RouteState) -> RouteState:
        latest = await nodes.extract_latest_user_text(state.messages)
        state.latest_user_text = latest
        return state

    async def on_enter_safety(state: RouteState) -> RouteState:
        state.is_sensitive = await nodes.classify_safety(state.latest_user_text)
        return state

    async def on_enter_task_type(state: RouteState) -> RouteState:
        state.route = await nodes.classify_task_type(state.latest_user_text)
        return state

    async def on_enter_reject(state: RouteState) -> RouteState:
        state.reject_text = await nodes.run_reject(state.latest_user_text)
        return state

    async def on_enter_deep(state: RouteState) -> RouteState:
        state.intermediate_text = await nodes.run_deep(state.latest_user_text)
        return state

    async def on_enter_simple(state: RouteState) -> RouteState:
        state.intermediate_text = await nodes.run_simple(state.latest_user_text)
        return state

    async def on_enter_done(state: RouteState) -> RouteState:
        return state

    graph.add_node("extract", on_enter_extract)
    graph.add_node("safety", on_enter_safety)
    graph.add_node("task_type", on_enter_task_type)
    graph.add_node("reject", on_enter_reject)
    graph.add_node("deep", on_enter_deep)
    graph.add_node("simple", on_enter_simple)
    graph.add_node("done", on_enter_done)

    graph.set_entry_point("extract")
    graph.add_edge("extract", "safety")

    # safety routing
    def route_after_safety(state: RouteState):
        return "reject" if state.is_sensitive else "task_type"

    graph.add_conditional_edges("safety", route_after_safety)

    # task routing
    def route_after_task_type(state: RouteState):
        if state.route == "deep":
            return "deep"
        if state.route == "simple":
            return "simple"
        return "done"

    graph.add_conditional_edges("task_type", route_after_task_type)

    # from deep/simple to done
    graph.add_edge("deep", "done")
    graph.add_edge("simple", "done")
    # reject ends as done (consumer handles reject_text)
    graph.add_edge("reject", "done")

    graph.add_edge("done", END)

    return graph


async def run_routing(messages: list[HumanMessage | AIMessage], context: dict | None) -> RouteState:
    state = RouteState(messages=messages, context=context)
    app = build_routing_graph().compile()
    return await app.ainvoke(state)

