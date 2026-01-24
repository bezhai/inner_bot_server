"""Agent 配置注册表"""

from dataclasses import dataclass
from typing import ClassVar


@dataclass(frozen=True)
class AgentConfig:
    """Agent 配置"""

    prompt_id: str
    model_id: str
    trace_name: str | None = None


class AgentRegistry:
    """Agent 配置注册表

    提供集中管理 Agent 配置的能力，避免硬编码分散在各处。
    """

    _configs: ClassVar[dict[str, AgentConfig]] = {}

    @classmethod
    def register(cls, name: str, config: AgentConfig) -> None:
        """注册 Agent 配置"""
        cls._configs[name] = config

    @classmethod
    def get(cls, name: str) -> AgentConfig:
        """获取 Agent 配置"""
        if name not in cls._configs:
            raise KeyError(f"Unknown agent config: {name}")
        return cls._configs[name]

    @classmethod
    def has(cls, name: str) -> bool:
        """检查是否存在指定配置"""
        return name in cls._configs

    @classmethod
    def all_configs(cls) -> dict[str, AgentConfig]:
        """获取所有配置"""
        return dict(cls._configs)


# 预注册配置
AgentRegistry.register(
    "main",
    AgentConfig(
        prompt_id="main",
        model_id="main-chat-model",
        trace_name="main",
    ),
)

AgentRegistry.register(
    "search",
    AgentConfig(
        prompt_id="search",
        model_id="search-model",
        trace_name="search",
    ),
)

AgentRegistry.register(
    "history",
    AgentConfig(
        prompt_id="history_search",
        model_id="search-history-model",
        trace_name="history",
    ),
)

AgentRegistry.register(
    "guard",
    AgentConfig(
        prompt_id="guard_prompt_injection",  # Guard 有多个 prompt，这里只记录主要的
        model_id="guard-model",
        trace_name="guard",
    ),
)
