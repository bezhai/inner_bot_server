"""向后兼容层

重定向旧的导入路径到新的模块位置。
此模块仅用于过渡期，新代码应直接从新路径导入。

旧路径 -> 新路径:
- app.agents.basic.agent -> app.agents.core.agent
- app.agents.basic.context -> app.agents.core.context
- app.agents.basic.origin_client -> app.agents.clients
- app.agents.basic.model_builder -> app.agents.infra.model_builder
- app.agents.basic.langfuse -> app.agents.infra.langfuse
- app.agents.basic.exceptions -> app.agents.infra.exceptions
"""

import warnings

# 发出弃用警告
warnings.warn(
    "app.agents.basic is deprecated. "
    "Please use app.agents.core, app.agents.clients, or app.agents.infra instead.",
    DeprecationWarning,
    stacklevel=2,
)

# 重新导出，保持向后兼容
from app.agents.core.agent import ChatAgent
from app.agents.core.context import ContextSchema

__all__ = ["ChatAgent", "ContextSchema"]
