from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime


class ChatMessage(BaseModel):
    """
    聊天消息
    Chat message request
    """

    user_id: str  # 用户id（透传，不存储用户信息）/ User ID (passed through, not stored)
    user_name: (
        str  # 用户名（透传，不存储用户信息）/ User name (passed through, not stored)
    )
    content: str  # 转义成markdown的消息内容 / Markdown content
    is_mention_bot: bool  # 是否@机器人 / Mention bot
    role: str  # 角色: 'user' | 'assistant' / Role
    root_message_id: str  # 根消息id / Root message ID
    reply_message_id: Optional[str] = None  # 回复消息的id / Reply message ID
    message_id: str  # 消息id / Message ID
    chat_id: str  # 聊天id / Chat ID
    chat_type: str  # 聊天类型: 'p2p' | 'group' / Chat type
    create_time: str  # 创建时间 / Creation time


class MessageResponse(BaseModel):
    """
    消息响应
    Message response
    """

    message_id: str  # 消息ID / Message ID
    status: str  # 状态: 'success' | 'error' / Status
    message: str  # 消息 / Message


class MemorySearchRequest(BaseModel):
    """
    记忆检索请求
    Memory search request
    """

    chat_id: str  # 聊天ID / Chat ID
    user_id: str  # 用户ID（透传，不存储用户信息）/ User ID (passed through, not stored)
    user_name: (
        str  # 用户名（透传，不存储用户信息）/ User name (passed through, not stored)
    )
    query: str  # 查询文本 / Query text
    context_message_id: Optional[str] = None  # 上下文消息ID / Context message ID
    max_results: Optional[int] = 10  # 最大结果数 / Maximum number of results


class MemorySearchResponse(BaseModel):
    """
    记忆检索响应
    Memory search response
    """

    query: str  # 查询文本 / Query text
    short_term_memories: List[Dict[str, Any]]  # 短期记忆 / Short-term memories
    user_profile: Optional[Dict[str, Any]] = None  # 用户画像 / User profile
    status: str  # 状态: 'success' | 'error' / Status


class TopicSearchRequest(BaseModel):
    """
    主题检索请求
    Topic search request
    """

    chat_id: Optional[str] = None  # 聊天ID / Chat ID
    user_id: str  # 用户ID（透传，不存储用户信息）/ User ID (passed through, not stored)
    user_name: (
        str  # 用户名（透传，不存储用户信息）/ User name (passed through, not stored)
    )
    query: str  # 查询文本 / Query text
    topic_id: Optional[str] = None  # 主题ID / Topic ID
    include_original_messages: bool = (
        False  # 是否包含原始消息 / Include original messages
    )
    max_results: Optional[int] = 5  # 最大结果数 / Maximum number of results


class TopicSearchResponse(BaseModel):
    """
    主题检索响应
    Topic search response
    """

    query: str  # 查询文本 / Query text
    mid_term_memories: List[Dict[str, Any]]  # 中期记忆 / Mid-term memories
    long_term_memories: List[Dict[str, Any]]  # 长期记忆 / Long-term memories
    original_messages: Optional[List[Dict[str, Any]]] = (
        None  # 原始消息 / Original messages
    )
    status: str  # 状态: 'success' | 'error' / Status
