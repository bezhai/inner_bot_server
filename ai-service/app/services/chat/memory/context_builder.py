"""
增强的上下文服务 - 基于智能记忆管理的上下文构建
"""

import asyncio
import logging
import time
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple

from app.types.chat import ChatMessage, ChatSimpleMessage
from app.types.memory import MessageFeatures, RelevanceScore
from app.services.chat.memory.message_analyzer import MessageAnalyzer
from app.services.chat.memory.relevance_scorer import RelevanceScorer
from app.services.chat.memory.data_collector import DataCollector
from app.config.memory_config import memory_config
from app.orm.crud import (
    get_messages_by_root_id,
    get_recent_messages_in_chat,
)

logger = logging.getLogger(__name__)


class EnhancedContextService:
    """
    增强的上下文服务
    基于智能记忆管理的独立上下文构建服务
    """

    def __init__(self):
        self.analyzer = MessageAnalyzer()
        self.scorer = RelevanceScorer()
        self.data_collector = DataCollector()

        # 性能配置
        self.timeout_seconds = memory_config.context_build_timeout_seconds
        self.max_context_messages = memory_config.max_context_messages
        self.time_window_hours = memory_config.time_window_hours

    async def build_intelligent_context(
        self,
        current_message: ChatMessage,
        max_context: int = None,
        time_window_hours: int = None,
    ) -> List[ChatSimpleMessage]:
        """
        智能构建对话上下文，替换原有的build_*_context方法

        Args:
            current_message: 当前消息
            max_context: 最大上下文消息数
            time_window_hours: 时间窗口（小时）

        Returns:
            List[ChatSimpleMessage]: 构建的上下文消息列表
        """
        start_time = time.time()
        fallback_used = False

        try:
            # 使用配置的默认值
            if max_context is None:
                max_context = self.max_context_messages
            if time_window_hours is None:
                time_window_hours = self.time_window_hours

            logger.info(f"开始智能上下文构建: message_id={current_message.message_id}")

            # 设置超时处理
            try:
                context_messages = await asyncio.wait_for(
                    self._build_context_with_intelligence(
                        current_message, max_context, time_window_hours
                    ),
                    timeout=self.timeout_seconds,
                )
            except asyncio.TimeoutError:
                logger.warning(f"智能上下文构建超时，降级到传统方法")
                fallback_used = True
                context_messages = await self._fallback_to_traditional_context(
                    current_message, max_context
                )

            processing_time_ms = int((time.time() - start_time) * 1000)

            # 异步记录数据
            if self.data_collector.should_sample():
                asyncio.create_task(
                    self._record_context_usage(
                        current_message,
                        context_messages,
                        processing_time_ms,
                        fallback_used,
                    )
                )

            logger.info(
                f"智能上下文构建完成: {len(context_messages)} 条消息，耗时 {processing_time_ms}ms"
            )

            return self._convert_to_simple_messages(context_messages)

        except Exception as e:
            logger.error(f"智能上下文构建失败: {str(e)}")
            fallback_used = True

            # 最终降级策略
            try:
                context_messages = await self._fallback_to_traditional_context(
                    current_message, max_context
                )
                return self._convert_to_simple_messages(context_messages)
            except Exception as fallback_error:
                logger.error(f"降级方案也失败: {str(fallback_error)}")
                return []

    async def _build_context_with_intelligence(
        self, current_message: ChatMessage, max_context: int, time_window_hours: int
    ) -> List[ChatMessage]:
        """
        使用智能记忆管理构建上下文
        """
        # 1. 分析当前消息特征
        current_features = self.analyzer.analyze_message(current_message)

        # 2. 获取候选消息池
        candidates = await self._get_candidate_messages(
            current_message, time_window_hours
        )

        if not candidates:
            logger.info("未找到候选消息")
            return []

        # 3. 分析候选消息特征
        candidate_features = []
        for candidate in candidates:
            features = self.analyzer.analyze_message(candidate)
            # 检查用户连续性
            features.is_continuous_from_same_user = self.analyzer.check_user_continuity(
                candidate,
                [current_message],
                memory_config.user_continuity_window_minutes,
            )
            candidate_features.append(features)

        # 4. 计算相关性评分
        scored_messages = self.scorer.batch_score_messages(
            current_features, candidate_features
        )

        # 5. 过滤低分消息
        filtered_messages = self.scorer.filter_by_threshold(scored_messages)

        # 6. 选择最优上下文
        selected_messages = self._select_optimal_context(filtered_messages, max_context)

        # 记录评分信息（用于数据收集）
        self._last_scored_messages = scored_messages

        return selected_messages

    async def _get_candidate_messages(
        self, current_message: ChatMessage, time_window_hours: int
    ) -> List[ChatMessage]:
        """
        获取候选消息，整合回复链和时间窗口

        Args:
            current_message: 当前消息
            time_window_hours: 时间窗口

        Returns:
            List[ChatMessage]: 候选消息列表
        """
        candidates = []

        try:
            # 获取回复链消息（高优先级）
            if (
                hasattr(current_message, "root_message_id")
                and current_message.root_message_id
            ):
                thread_messages = await get_messages_by_root_id(
                    current_message.root_message_id,
                    exclude_current=current_message.message_id,
                    limit=15,
                )
                candidates.extend(thread_messages)
                logger.debug(f"获取回复链消息: {len(thread_messages)} 条")

            # 获取时间窗口内的消息
            current_time = datetime.fromtimestamp(
                int(current_message.create_time) / 1000
            )
            time_window_start = current_time - timedelta(hours=time_window_hours)

            recent_messages = await get_recent_messages_in_chat(
                chat_id=current_message.chat_id,
                before_time=current_time,
                after_time=time_window_start,
                limit=60,  # 增大候选池
                exclude_current=current_message.message_id,
            )
            candidates.extend(recent_messages)
            logger.debug(f"获取时间窗口消息: {len(recent_messages)} 条")

            # 去重
            unique_candidates = {msg.message_id: msg for msg in candidates}
            result = list(unique_candidates.values())

            logger.info(f"候选消息池: 总计 {len(result)} 条消息")
            return result

        except Exception as e:
            logger.error(f"获取候选消息失败: {str(e)}")
            return []

    def _select_optimal_context(
        self,
        scored_messages: List[Tuple[MessageFeatures, RelevanceScore]],
        max_context: int,
    ) -> List[ChatMessage]:
        """
        选择最优上下文消息

        Args:
            scored_messages: 已评分的消息列表
            max_context: 最大上下文消息数

        Returns:
            List[ChatMessage]: 选中的上下文消息
        """
        try:
            if not scored_messages:
                return []

            # 按相关性分数排序（已经排序过了）
            selected = []

            # 优先选择高分消息
            for message_features, score in scored_messages:
                if len(selected) >= max_context:
                    break

                # 这里需要从message_features重新构造ChatMessage对象
                # 或者在前面的流程中保留ChatMessage对象的引用
                # 暂时先用message_id查询
                selected.append(message_features)  # 临时处理

            logger.info(f"选择上下文消息: {len(selected)} 条")
            return selected

        except Exception as e:
            logger.error(f"选择最优上下文失败: {str(e)}")
            return []

    async def _fallback_to_traditional_context(
        self, current_message: ChatMessage, max_context: int
    ) -> List[ChatMessage]:
        """
        降级到传统的上下文构建方法

        Args:
            current_message: 当前消息
            max_context: 最大上下文消息数

        Returns:
            List[ChatMessage]: 上下文消息列表
        """
        try:
            logger.info("使用传统上下文构建方法")

            # 简单的时间序上下文构建
            current_time = datetime.fromtimestamp(
                int(current_message.create_time) / 1000
            )
            time_window_start = current_time - timedelta(hours=24)

            recent_messages = await get_recent_messages_in_chat(
                chat_id=current_message.chat_id,
                before_time=current_time,
                after_time=time_window_start,
                limit=max_context,
                exclude_current=current_message.message_id,
            )

            # 按时间排序
            recent_messages.sort(key=lambda x: int(x.create_time))

            logger.info(f"传统上下文构建完成: {len(recent_messages)} 条消息")
            return recent_messages

        except Exception as e:
            logger.error(f"传统上下文构建也失败: {str(e)}")
            return []

    def _convert_to_simple_messages(self, messages: List) -> List[ChatSimpleMessage]:
        """
        转换为ChatSimpleMessage格式

        Args:
            messages: 消息列表

        Returns:
            List[ChatSimpleMessage]: 转换后的消息列表
        """
        try:
            simple_messages = []

            for msg in messages:
                if isinstance(msg, ChatMessage):
                    simple_messages.append(
                        ChatSimpleMessage(
                            user_name=getattr(msg, "user_name", msg.user_id),
                            role=msg.role,
                            content=msg.content,
                        )
                    )
                elif isinstance(msg, MessageFeatures):
                    # 临时处理MessageFeatures对象
                    simple_messages.append(
                        ChatSimpleMessage(
                            user_name=msg.user_id,
                            role="user",  # 默认角色
                            content=msg.content,
                        )
                    )

            # 按时间排序
            if simple_messages and hasattr(messages[0], "timestamp"):
                simple_messages.sort(key=lambda x: getattr(x, "timestamp", 0))

            return simple_messages

        except Exception as e:
            logger.error(f"转换消息格式失败: {str(e)}")
            return []

    async def _record_context_usage(
        self,
        trigger_message: ChatMessage,
        selected_messages: List,
        processing_time_ms: int,
        fallback_used: bool,
    ):
        """
        记录上下文使用情况
        """
        try:
            if hasattr(self, "_last_scored_messages"):
                await self.data_collector.record_context_usage(
                    trigger_message=trigger_message,
                    selected_messages=selected_messages,
                    scored_messages=self._last_scored_messages,
                    processing_time_ms=processing_time_ms,
                    fallback_used=fallback_used,
                )
                # 清理临时数据
                delattr(self, "_last_scored_messages")

        except Exception as e:
            logger.error(f"记录上下文使用失败: {str(e)}")
