from sqlalchemy import (
    Column,
    String,
    Boolean,
    Integer,
    Text,
    TIMESTAMP,
    ForeignKey,
    JSON,
)
from sqlalchemy.dialects.postgresql import UUID
from .base import Base


class FormatedMessage(Base):
    __tablename__ = "formated_message"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, nullable=False)
    user_open_id = Column(String, nullable=True)
    user_name = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    is_mention_bot = Column(Boolean, nullable=False)
    role = Column(String, nullable=False)
    root_message_id = Column(String, nullable=True)
    reply_message_id = Column(String, nullable=True)
    message_id = Column(
        String, nullable=False, unique=True
    )  # 使用unique=True直接定义唯一约束
    chat_id = Column(String, nullable=False)
    chat_type = Column(String, nullable=False)
    create_time = Column(TIMESTAMP, nullable=False)


class ModelProvider(Base):
    __tablename__ = "model_provider"
    provider_id = Column(UUID(as_uuid=True), primary_key=True)  # 供应商ID，UUID类型
    name = Column(String(100), nullable=False)  # 供应商名称，如 "OpenAI"
    api_key = Column(Text, nullable=False)  # API密钥
    base_url = Column(Text, nullable=False)  # API基础URL
    is_active = Column(Boolean, default=True, nullable=False)  # 是否可用
    created_at = Column(TIMESTAMP, nullable=False)
    updated_at = Column(TIMESTAMP, nullable=False)


class AIModel(Base):
    __tablename__ = "ai_model"
    model_id = Column(String, primary_key=True)  # 模型ID，如 "gpt-4o-mini"
    model_name = Column(String, nullable=True)  # 实际调用名
    name = Column(String(100), nullable=False)  # 展示名
    description = Column(Text, nullable=True)  # 描述
    is_restricted = Column(Boolean, default=False, nullable=False)  # 是否受限
    is_active = Column(Boolean, default=True, nullable=False)  # 是否可用
    is_default = Column(Boolean, default=False, nullable=False)  # 是否默认
    default_params = Column(JSON, nullable=True)  # 默认参数
    is_multimodal = Column(Boolean, default=False, nullable=False)  # 是否多模态
    is_thinking = Column(Boolean, default=False, nullable=False)  # 是否思维链
    created_at = Column(TIMESTAMP, nullable=False)
    updated_at = Column(TIMESTAMP, nullable=False)
    provider_id = Column(
        UUID(as_uuid=True), ForeignKey("model_provider.provider_id"), nullable=False
    )  # 供应商外键
