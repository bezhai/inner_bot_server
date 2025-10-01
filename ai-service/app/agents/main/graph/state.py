from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage


@dataclass
class RouteState:
    """
    LangGraph routing state for main agent.
    """

    # inputs
    messages: list[HumanMessage | AIMessage]
    context: dict[str, Any] | None

    # derived
    latest_user_text: str = ""

    # classifiers
    is_sensitive: bool = False
    route: str = "normal"  # one of: normal | deep | simple

    # intermediate outputs
    intermediate_text: str = ""  # deep/simple results
    reject_text: str = ""  # reject node result if sensitive

