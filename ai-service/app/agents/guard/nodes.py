"""向后兼容层 - Guard Nodes

重定向到 app.agents.graphs.guard.nodes
"""

import warnings

warnings.warn(
    "app.agents.guard.nodes is deprecated. "
    "Please use app.agents.graphs.guard.nodes instead.",
    DeprecationWarning,
    stacklevel=2,
)

from app.agents.graphs.guard.nodes import (
    PoliticsCheckResult,
    PromptInjectionResult,
    aggregate_results,
    check_banned_word_node,
    check_prompt_injection,
    check_sensitive_politics,
    create_langfuse_config,
)

__all__ = [
    "PromptInjectionResult",
    "PoliticsCheckResult",
    "check_banned_word_node",
    "check_prompt_injection",
    "check_sensitive_politics",
    "aggregate_results",
    "create_langfuse_config",
]
