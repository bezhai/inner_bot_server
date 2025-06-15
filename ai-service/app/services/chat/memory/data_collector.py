"""
数据收集器 - 记录上下文使用情况，为后续优化和模型训练提供数据
"""

import asyncio
import logging
import uuid
from datetime import datetime
from typing import List, Dict, Optional

from app.types.chat import ChatMessage
from app.types.memory import ContextUsageRecord, MessageFeatures, RelevanceScore
from app.config.memory_config import memory_config

logger = logging.getLogger(__name__)


class DataCollector:
    """
    数据收集器
    负责收集上下文使用情况、相关性评分、用户反馈等数据
    """

    def __init__(self):
        self.enabled = memory_config.enable_data_collection
        self.async_collection = memory_config.enable_async_data_collection
        self.sample_rate = memory_config.sample_rate

    async def record_context_usage(
        self,
        trigger_message: ChatMessage,
        selected_messages: List[ChatMessage],
        scored_messages: List[tuple[MessageFeatures, RelevanceScore]],
        processing_time_ms: int = None,
        fallback_used: bool = False,
    ) -> str:
        """
        记录上下文使用情况

        Args:
            trigger_message: 触发消息
            selected_messages: 被选中的上下文消息
            scored_messages: 所有评分过的消息
            processing_time_ms: 处理时间（毫秒）
            fallback_used: 是否使用了降级策略

        Returns:
            str: 上下文记录ID
        """
        if not self.enabled:
            return ""

        try:
            # 生成唯一的上下文ID
            context_id = str(uuid.uuid4())

            # 提取相关性评分
            relevance_scores = {}
            for message_features, score in scored_messages:
                relevance_scores[message_features.message_id] = {
                    "total_score": score.total_score,
                    "reply_chain_score": score.reply_chain_score,
                    "user_continuity_score": score.user_continuity_score,
                    "time_decay_score": score.time_decay_score,
                    "mention_relation_score": score.mention_relation_score,
                    "keyword_overlap_score": score.keyword_overlap_score,
                }

            # 创建使用记录
            usage_record = ContextUsageRecord(
                context_id=context_id,
                chat_id=trigger_message.chat_id,
                user_id=trigger_message.user_id,
                trigger_message_id=trigger_message.message_id,
                context_message_ids=[msg.message_id for msg in selected_messages],
                context_message_count=len(selected_messages),
                relevance_scores=relevance_scores,
                processing_time_ms=processing_time_ms,
                fallback_used=fallback_used,
                created_at=datetime.now(),
            )

            # 根据配置决定同步还是异步存储
            if self.async_collection:
                asyncio.create_task(self._store_usage_record(usage_record))
            else:
                await self._store_usage_record(usage_record)

            logger.info(f"上下文使用记录已创建: {context_id}")
            return context_id

        except Exception as e:
            logger.error(f"记录上下文使用失败: {str(e)}")
            return ""

    async def _store_usage_record(self, record: ContextUsageRecord):
        """
        存储使用记录到数据库

        Args:
            record: 上下文使用记录
        """
        try:
            # 这里需要实现具体的数据库操作
            # 暂时用日志记录，后续集成到实际的数据库中
            logger.info(f"存储上下文使用记录: {record.model_dump_json()}")

            # TODO: 实现实际的数据库存储
            # await insert_context_usage_record(record)

        except Exception as e:
            logger.error(f"存储使用记录失败: {str(e)}")

    async def record_user_feedback(
        self, context_id: str, feedback: str, success_score: float
    ):
        """
        记录用户反馈

        Args:
            context_id: 上下文ID
            feedback: 用户反馈文本
            success_score: 成功评分 (0.0-1.0)
        """
        if not self.enabled:
            return

        try:
            # TODO: 实现用户反馈的存储
            logger.info(
                f"用户反馈记录: context_id={context_id}, score={success_score}, feedback={feedback}"
            )

        except Exception as e:
            logger.error(f"记录用户反馈失败: {str(e)}")

    async def collect_performance_metrics(self) -> Dict:
        """
        收集性能指标

        Returns:
            Dict: 性能指标数据
        """
        try:
            # TODO: 从数据库查询统计数据
            metrics = {
                "total_contexts_built": 0,
                "avg_processing_time_ms": 0.0,
                "avg_relevance_score": 0.0,
                "avg_context_message_count": 0.0,
                "fallback_rate": 0.0,
                "unique_chats_served": 0,
            }

            logger.info(f"性能指标收集完成: {metrics}")
            return metrics

        except Exception as e:
            logger.error(f"收集性能指标失败: {str(e)}")
            return {}

    def should_sample(self) -> bool:
        """
        根据采样率决定是否应该收集数据

        Returns:
            bool: 是否应该收集
        """
        if not self.enabled:
            return False

        import random

        return random.random() < self.sample_rate

    async def export_training_data(
        self,
        chat_id: str = None,
        start_date: datetime = None,
        end_date: datetime = None,
    ) -> List[Dict]:
        """
        导出训练数据

        Args:
            chat_id: 可选的聊天ID过滤
            start_date: 开始日期
            end_date: 结束日期

        Returns:
            List[Dict]: 训练数据列表
        """
        try:
            # TODO: 实现从数据库查询和导出训练数据
            training_data = []

            logger.info(f"训练数据导出完成，共 {len(training_data)} 条记录")
            return training_data

        except Exception as e:
            logger.error(f"导出训练数据失败: {str(e)}")
            return []

    async def analyze_relevance_accuracy(self) -> Dict:
        """
        分析相关性评分的准确性

        Returns:
            Dict: 准确性分析结果
        """
        try:
            # TODO: 基于用户反馈分析相关性评分的准确性
            analysis = {
                "total_samples": 0,
                "high_score_high_feedback": 0,
                "high_score_low_feedback": 0,
                "low_score_high_feedback": 0,
                "low_score_low_feedback": 0,
                "accuracy_rate": 0.0,
            }

            logger.info(f"相关性准确性分析完成: {analysis}")
            return analysis

        except Exception as e:
            logger.error(f"分析相关性准确性失败: {str(e)}")
            return {}

    async def get_context_effectiveness_stats(self, days: int = 7) -> Dict:
        """
        获取上下文有效性统计

        Args:
            days: 统计天数

        Returns:
            Dict: 有效性统计
        """
        try:
            # TODO: 查询最近N天的上下文使用效果统计
            stats = {
                "total_contexts": 0,
                "avg_message_count": 0.0,
                "most_common_message_count": 0,
                "fallback_usage_rate": 0.0,
                "avg_relevance_score": 0.0,
                "top_scoring_patterns": [],
            }

            logger.info(f"上下文有效性统计完成: {stats}")
            return stats

        except Exception as e:
            logger.error(f"获取上下文有效性统计失败: {str(e)}")
            return {}
