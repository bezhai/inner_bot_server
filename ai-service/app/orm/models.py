from sqlalchemy import (
    TIMESTAMP,
    Boolean,
    Column,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID

from .base import Base


class ModelProvider(Base):
    __tablename__ = "model_provider"
    provider_id = Column(UUID(as_uuid=True), primary_key=True)  # 供应商ID，UUID类型
    name = Column(String(100), nullable=False)  # 供应商名称，如 "OpenAI"
    api_key = Column(Text, nullable=False)  # API密钥
    base_url = Column(Text, nullable=False)  # API基础URL
    is_active = Column(Boolean, default=True, nullable=False)  # 是否可用
    created_at = Column(TIMESTAMP, nullable=False)
    updated_at = Column(TIMESTAMP, nullable=False)


class Prompt(Base):
    __tablename__ = "prompt"
    id = Column(String, primary_key=True)  # 模板ID
    name = Column(String, nullable=False)  # 模板名称
    description = Column(String, nullable=False)  # 模板描述
    content = Column(Text, nullable=False)  # 模板内容
    created_at = Column(TIMESTAMP, nullable=False)
    updated_at = Column(TIMESTAMP, nullable=False)
