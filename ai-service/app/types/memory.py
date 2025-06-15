"""
智能记忆管理相关数据类型
"""

from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum


class MessageType(str, Enum):
    """消息类型枚举"""

    QUESTION = "question"
    ANSWER = "answer"
    DISCUSSION = "discussion"
    NOTIFICATION = "notification"
    CASUAL = "casual"


class ReplyInfo(BaseModel):
    """回复信息"""

    reply_to_message_id: str
    reply_to_user_id: str
    reply_type: str  # "quote", "mention", "thread"


class MessageFeatures(BaseModel):
    """消息特征"""

    message_id: str
    user_id: str
    chat_id: str
    content: str
    timestamp: int
    reply_to: Optional[ReplyInfo] = None
    mentions: List[str] = []
    message_type: MessageType = MessageType.CASUAL
    keywords: List[str] = []

    # 特征评分
    has_question: bool = False
    has_at_mention: bool = False
    is_continuous_from_same_user: bool = False


class RelevanceScore(BaseModel):
    """相关性评分详情"""

    total_score: float
    reply_chain_score: float
    user_continuity_score: float
    time_decay_score: float
    mention_relation_score: float
    keyword_overlap_score: float


class ContextUsageRecord(BaseModel):
    """上下文使用记录"""

    context_id: str
    chat_id: str
    user_id: str
    trigger_message_id: str
    context_message_ids: List[str]
    context_message_count: int
    relevance_scores: Optional[Dict[str, float]] = None
    processing_time_ms: Optional[int] = None
    fallback_used: bool = False
    created_at: datetime = datetime.now()


class MemoryMetrics(BaseModel):
    """记忆管理指标"""

    avg_context_build_time_ms: float
    avg_relevance_score: float
    avg_context_message_count: float
    fallback_rate: float
    total_contexts_built: int
    unique_chats_served: int
