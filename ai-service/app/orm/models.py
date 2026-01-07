from datetime import datetime
from uuid import UUID as PyUUID

from sqlalchemy import (
    UUID,
    BigInteger,
    Boolean,
    DateTime,
    Float,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class LarkUser(Base):
    __tablename__ = "lark_user"

    union_id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    avatar_origin: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_admin: Mapped[bool | None] = mapped_column(Boolean, nullable=True)


class ModelProvider(Base):
    __tablename__ = "model_provider"

    provider_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    api_key: Mapped[str] = mapped_column(Text)
    base_url: Mapped[str] = mapped_column(Text)
    # 用于区分底层客户端类型，例如 "openai"、"ark" 等
    client_type: Mapped[str] = mapped_column(String(50), default="openai")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime)
    updated_at: Mapped[datetime] = mapped_column(DateTime)


class ModelMapping(Base):
    __tablename__ = "model_mappings"

    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    alias: Mapped[str] = mapped_column(String(100), unique=True)
    provider_name: Mapped[str] = mapped_column(String(100))
    real_model_name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    model_config: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=func.now(), onupdate=func.now()
    )


class ConversationMessage(Base):
    __tablename__ = "conversation_messages"

    message_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(100))
    content: Mapped[str] = mapped_column(Text)
    role: Mapped[str] = mapped_column(String(20))
    root_message_id: Mapped[str] = mapped_column(String(100))
    reply_message_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    chat_id: Mapped[str] = mapped_column(String(100))
    chat_type: Mapped[str] = mapped_column(String(10))
    create_time: Mapped[int] = mapped_column(BigInteger)


class LarkGroupChatInfo(Base):
    __tablename__ = "lark_group_chat_info"

    chat_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    name: Mapped[str] = mapped_column(String)
    avatar: Mapped[str | None] = mapped_column(Text, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    user_count: Mapped[int] = mapped_column(BigInteger)
    chat_status: Mapped[str] = mapped_column(String(20))
    is_leave: Mapped[bool | None] = mapped_column(Boolean, nullable=True, default=False)


class TopicMemory(Base):
    __tablename__ = "topic_memory"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    group_id: Mapped[str] = mapped_column(String(100))
    title: Mapped[str] = mapped_column(String(255))
    summary: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)


class MemoryVersion(Base):
    """记忆版本快照"""

    __tablename__ = "memory_versions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    memory_id: Mapped[str] = mapped_column(String(100), index=True)
    group_id: Mapped[str] = mapped_column(String(100), index=True)
    version: Mapped[int] = mapped_column(Integer)

    statement: Mapped[str] = mapped_column(Text)
    parent_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    change_summary: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[str] = mapped_column(
        String(20), default="active"
    )  # active/deprecated
    strength: Mapped[float] = mapped_column(Float, default=0.8)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    deprecated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class UserProfile(Base):
    """用户画像：全局唯一"""

    __tablename__ = "user_profiles"

    user_id: Mapped[str] = mapped_column(String(100), primary_key=True)

    # 修改处：
    # 1. 类型注解改为 str | None
    # 2. 数据库类型改为 Text (支持长文本)
    profile: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )


class GroupProfile(Base):
    """群聊画像：每个群唯一"""

    __tablename__ = "group_profiles"

    chat_id: Mapped[str] = mapped_column(String(100), primary_key=True)

    # 修改处：同上
    profile: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )


class LarkBaseChatInfo(Base):
    """基础聊天信息"""

    __tablename__ = "lark_base_chat_info"

    chat_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    chat_mode: Mapped[str] = mapped_column(String(10))
    permission_config: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    gray_config: Mapped[dict | None] = mapped_column(JSONB, nullable=True)


class LarkGroupMember(Base):
    """群成员信息"""

    __tablename__ = "lark_group_member"

    chat_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    union_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    is_owner: Mapped[bool] = mapped_column(Boolean, default=False)
    is_manager: Mapped[bool] = mapped_column(Boolean, default=False)
    is_leave: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
