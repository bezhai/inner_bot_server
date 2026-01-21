"""Agent 执行上下文

使用组合模式设计上下文，将必需字段和可选字段分离。
"""

from dataclasses import dataclass, field
from typing import Any

from bidict import bidict


@dataclass(frozen=True)
class MessageContext:
    """消息级上下文（必需字段）"""

    message_id: str
    chat_id: str


@dataclass
class MediaContext:
    """媒体上下文（可选）"""

    image_urls: list[str] = field(default_factory=list)


@dataclass
class UserContext:
    """用户上下文（可选）"""

    # external_id <-> internal_id 的双向映射
    user_id_map: bidict[str, str] = field(default_factory=bidict)

    def get_internal_id(self, external_id: str) -> str | None:
        """根据外部 ID 获取内部 ID"""
        return self.user_id_map.get(external_id)

    def get_external_id(self, internal_id: str) -> str | None:
        """根据内部 ID 获取外部 ID"""
        return self.user_id_map.inverse.get(internal_id)


@dataclass
class FeatureFlags:
    """特性标志（灰度配置）"""

    flags: dict[str, Any] = field(default_factory=dict)

    def get(self, key: str, default: Any = None) -> Any:
        return self.flags.get(key, default)


@dataclass
class AgentContext:
    """Agent 执行上下文（组合模式）

    使用组合模式将不同类型的上下文组合在一起，
    既保持了类型安全，又提供了灵活性。
    """

    message: MessageContext
    media: MediaContext = field(default_factory=MediaContext)
    user: UserContext = field(default_factory=UserContext)
    features: FeatureFlags = field(default_factory=FeatureFlags)


# 为了向后兼容，保留原有的 ContextSchema
# 这是一个过渡期的兼容层，后续可以逐步迁移到 AgentContext
@dataclass
class ContextSchema:
    """向后兼容的上下文 Schema

    保留原有的字段名和结构，便于逐步迁移。
    """

    curr_message_id: str | None = None
    curr_chat_id: str | None = None
    image_url_list: list[str] | None = None
    user_id_map: bidict[str, str] | None = None
    gray_config: dict[str, str] | None = None

    def to_agent_context(self) -> AgentContext | None:
        """转换为新的 AgentContext 格式"""
        if self.curr_message_id is None or self.curr_chat_id is None:
            return None

        return AgentContext(
            message=MessageContext(
                message_id=self.curr_message_id,
                chat_id=self.curr_chat_id,
            ),
            media=MediaContext(
                image_urls=self.image_url_list or [],
            ),
            user=UserContext(
                user_id_map=self.user_id_map or bidict(),
            ),
            features=FeatureFlags(
                flags=dict(self.gray_config) if self.gray_config else {},
            ),
        )

    @classmethod
    def from_agent_context(cls, ctx: AgentContext) -> "ContextSchema":
        """从 AgentContext 创建 ContextSchema"""
        return cls(
            curr_message_id=ctx.message.message_id,
            curr_chat_id=ctx.message.chat_id,
            image_url_list=ctx.media.image_urls or None,
            user_id_map=ctx.user.user_id_map or None,
            gray_config=dict(ctx.features.flags) if ctx.features.flags else None,
        )
