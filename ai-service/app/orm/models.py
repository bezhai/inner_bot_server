from datetime import datetime
from uuid import UUID as PyUUID

from sqlalchemy import UUID, BigInteger, Boolean, DateTime, String, Text
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
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime)
    updated_at: Mapped[datetime] = mapped_column(DateTime)


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
