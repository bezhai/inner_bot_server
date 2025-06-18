"""
相关性评分器 - 基于多个维度计算消息的相关性分数
"""

import logging
import math
from datetime import datetime, timedelta
from typing import List, Set

from app.types.memory import MessageFeatures, RelevanceScore
from app.config.memory_config import memory_config

logger = logging.getLogger(__name__)


class RelevanceScorer:
    """相关性评分器，基于多个维度计算消息相关性"""

    def __init__(self):
        # 从配置中获取权重
        self.weights = {
            "reply_chain": memory_config.reply_chain_weight,
            "user_continuity": memory_config.user_continuity_weight,
            "time_decay": memory_config.time_decay_weight,
            "mention_relation": memory_config.mention_relation_weight,
            "keyword_overlap": memory_config.keyword_overlap_weight,
        }

        self.time_decay_factor = memory_config.time_decay_factor

    def calculate_relevance(
        self, target_message: MessageFeatures, candidate_message: MessageFeatures
    ) -> RelevanceScore:
        """
        计算候选消息与目标消息的相关性分数

        Args:
            target_message: 目标消息（触发消息）
            candidate_message: 候选消息

        Returns:
            RelevanceScore: 详细的相关性评分
        """
        try:
            # 计算各个维度的分数
            reply_chain_score = self._score_reply_chain(
                target_message, candidate_message
            )
            user_continuity_score = self._score_user_continuity(
                target_message, candidate_message
            )
            time_decay_score = self._score_time_decay(target_message, candidate_message)
            mention_relation_score = self._score_mention_relation(
                target_message, candidate_message
            )
            keyword_overlap_score = self._score_keyword_overlap(
                target_message, candidate_message
            )

            # 加权计算总分
            total_score = (
                reply_chain_score * self.weights["reply_chain"]
                + user_continuity_score * self.weights["user_continuity"]
                + time_decay_score * self.weights["time_decay"]
                + mention_relation_score * self.weights["mention_relation"]
                + keyword_overlap_score * self.weights["keyword_overlap"]
            )

            logger.info(
                f"相关性评分: {candidate_message.message_id} -> {total_score:.3f}, 权重: {self.weights}"
            )

            # 确保分数在0-1范围内
            total_score = max(0.0, min(1.0, total_score))

            logger.debug(
                f"相关性评分完成: {candidate_message.message_id} -> {total_score:.3f}"
            )

            return RelevanceScore(
                total_score=total_score,
                reply_chain_score=reply_chain_score,
                user_continuity_score=user_continuity_score,
                time_decay_score=time_decay_score,
                mention_relation_score=mention_relation_score,
                keyword_overlap_score=keyword_overlap_score,
            )

        except Exception as e:
            logger.error(f"相关性评分失败: {str(e)}")
            # 返回零分
            return RelevanceScore(
                total_score=0.0,
                reply_chain_score=0.0,
                user_continuity_score=0.0,
                time_decay_score=0.0,
                mention_relation_score=0.0,
                keyword_overlap_score=0.0,
            )

    def _score_reply_chain(
        self, target: MessageFeatures, candidate: MessageFeatures
    ) -> float:
        """
        评分回复链相关性
        回复链是最强的相关性信号
        """
        try:
            # 检查是否在同一回复链中
            if target.reply_to and candidate.reply_to:
                # 都是回复消息，检查是否回复同一消息
                if (
                    target.reply_to.reply_to_message_id
                    == candidate.reply_to.reply_to_message_id
                ):
                    return 1.0

            # 检查目标消息是否回复了候选消息
            if (
                target.reply_to
                and target.reply_to.reply_to_message_id == candidate.message_id
            ):
                return 1.0

            # 检查候选消息是否回复了目标消息
            if (
                candidate.reply_to
                and candidate.reply_to.reply_to_message_id == target.message_id
            ):
                return 1.0

            return 0.0

        except Exception as e:
            logger.error(f"回复链评分失败: {str(e)}")
            return 0.0

    def _score_user_continuity(
        self, target: MessageFeatures, candidate: MessageFeatures
    ) -> float:
        """
        评分用户连续性
        同一用户在短时间内的连续发言具有较高相关性
        """
        try:
            # 不是同一用户，返回0分
            if target.user_id != candidate.user_id:
                return 0.0

            # 计算时间间隔
            time_diff_seconds = abs(target.timestamp - candidate.timestamp) / 1000
            time_diff_minutes = time_diff_seconds / 60

            # 在配置的时间窗口内，给予高分
            window_minutes = memory_config.user_continuity_window_minutes
            if time_diff_minutes <= window_minutes:
                # 时间越近，分数越高
                return 1.0 - (time_diff_minutes / window_minutes)

            return 0.0

        except Exception as e:
            logger.error(f"用户连续性评分失败: {str(e)}")
            return 0.0

    def _score_time_decay(
        self, target: MessageFeatures, candidate: MessageFeatures
    ) -> float:
        """
        评分时间衰减
        时间越近的消息相关性越高
        """
        try:
            # 计算时间间隔（小时）
            time_diff_seconds = abs(target.timestamp - candidate.timestamp) / 1000
            time_diff_hours = time_diff_seconds / 3600

            # 使用指数衰减函数
            decay_score = math.exp(-self.time_decay_factor * time_diff_hours)

            return decay_score

        except Exception as e:
            logger.error(f"时间衰减评分失败: {str(e)}")
            return 0.0

    def _score_mention_relation(
        self, target: MessageFeatures, candidate: MessageFeatures
    ) -> float:
        """
        评分@关系
        消息中互相@或@同一人具有相关性
        """
        try:
            score = 0.0

            # 目标消息@了候选消息的用户
            if candidate.user_id in target.mentions:
                score += 0.5

            # 候选消息@了目标消息的用户
            if target.user_id in candidate.mentions:
                score += 0.5

            # 两条消息@了相同的用户
            common_mentions = set(target.mentions) & set(candidate.mentions)
            if common_mentions:
                score += 0.3 * len(common_mentions)

            return min(1.0, score)

        except Exception as e:
            logger.error(f"@关系评分失败: {str(e)}")
            return 0.0

    def _score_keyword_overlap(
        self, target: MessageFeatures, candidate: MessageFeatures
    ) -> float:
        """
        评分关键词重叠
        共同关键词越多，相关性越高
        """
        try:
            if not target.keywords or not candidate.keywords:
                return 0.0

            target_keywords = set(target.keywords)
            candidate_keywords = set(candidate.keywords)

            # 计算交集和并集
            intersection = target_keywords & candidate_keywords
            union = target_keywords | candidate_keywords

            if not union:
                return 0.0

            # 使用Jaccard相似度
            jaccard_score = len(intersection) / len(union)

            return jaccard_score

        except Exception as e:
            logger.error(f"关键词重叠评分失败: {str(e)}")
            return 0.0

    def batch_score_messages(
        self, target_message: MessageFeatures, candidate_messages: List[MessageFeatures]
    ) -> List[tuple[MessageFeatures, RelevanceScore]]:
        """
        批量评分消息相关性

        Args:
            target_message: 目标消息
            candidate_messages: 候选消息列表

        Returns:
            List[tuple]: (消息, 相关性评分) 的列表，按相关性分数降序排列
        """
        try:
            scored_messages = []

            for candidate in candidate_messages:
                score = self.calculate_relevance(target_message, candidate)
                scored_messages.append((candidate, score))

            # 按总分降序排列
            scored_messages.sort(key=lambda x: x[1].total_score, reverse=True)

            return scored_messages

        except Exception as e:
            logger.error(f"批量评分失败: {str(e)}")
            return []

    def filter_by_threshold(
        self,
        scored_messages: List[tuple[MessageFeatures, RelevanceScore]],
        threshold: float = None,
    ) -> List[tuple[MessageFeatures, RelevanceScore]]:
        """
        根据阈值过滤低分消息

        Args:
            scored_messages: 已评分的消息列表
            threshold: 相关性阈值，默认使用配置值

        Returns:
            List[tuple]: 过滤后的消息列表
        """
        if threshold is None:
            threshold = memory_config.relevance_threshold

        return [
            (message, score)
            for message, score in scored_messages
            if score.total_score >= threshold
        ]
