"""
消息分析器 - 提取消息特征用于智能上下文构建
"""

import re
import logging
from typing import List, Optional
from datetime import datetime, timedelta

from app.types.chat import ChatMessage
from app.types.memory import MessageFeatures, MessageType, ReplyInfo

logger = logging.getLogger(__name__)


class MessageAnalyzer:
    """消息分析器，提取消息的各种特征"""

    def __init__(self):
        # 问题关键词模式
        self.question_patterns = [
            r"[？?]",  # 问号
            r"^(什么|怎么|如何|为什么|哪个|哪些|谁|何时|何地)",  # 疑问词开头
            r"(吗|呢|么)$",  # 疑问语气词结尾
            r"(怎么样|如何|可以|能否|是否)",  # 询问表达
        ]

        # @提及模式
        self.mention_pattern = re.compile(r"@(\w+)")

        # 关键词提取模式（简单版本）
        self.keyword_patterns = [
            r"[\u4e00-\u9fff]+",  # 中文词汇
            r"[a-zA-Z]+",  # 英文词汇
            r"\d+",  # 数字
        ]

    def analyze_message(self, message: ChatMessage) -> MessageFeatures:
        """
        分析消息并提取特征

        Args:
            message: 聊天消息对象

        Returns:
            MessageFeatures: 消息特征对象
        """
        try:
            # 基础信息
            features = MessageFeatures(
                message_id=message.message_id,
                user_id=message.user_id,
                chat_id=message.chat_id,
                content=message.content,
                timestamp=int(message.create_time),
            )

            # 提取回复信息
            features.reply_to = self._extract_reply_info(message)

            # 提取@提及
            features.mentions = self._extract_mentions(message.content)
            features.has_at_mention = len(features.mentions) > 0

            # 分类消息类型
            features.message_type = self._classify_message_type(message.content)

            # 提取关键词
            features.keywords = self._extract_keywords(message.content)

            # 检测是否包含问题
            features.has_question = self._has_question(message.content)

            logger.debug(f"消息特征分析完成: {message.message_id}")

            return features

        except Exception as e:
            logger.error(f"消息特征分析失败: {str(e)}")
            # 返回基础特征
            return MessageFeatures(
                message_id=message.message_id,
                user_id=message.user_id,
                chat_id=message.chat_id,
                content=message.content,
                timestamp=int(message.create_time),
            )

    def _extract_reply_info(self, message: ChatMessage) -> Optional[ReplyInfo]:
        """提取回复信息"""
        try:
            # 检查是否有root_message_id（回复链）
            if hasattr(message, "root_message_id") and message.root_message_id:
                if message.root_message_id != message.message_id:
                    return ReplyInfo(
                        reply_to_message_id=message.root_message_id,
                        reply_to_user_id="",  # 需要从数据库查询
                        reply_type="thread",
                    )

            # 检查消息内容中的引用格式
            # 这里可以根据实际的消息格式进行调整
            quote_pattern = re.search(r"引用了.*?的消息", message.content)
            if quote_pattern:
                return ReplyInfo(
                    reply_to_message_id="",  # 需要从消息中解析
                    reply_to_user_id="",
                    reply_type="quote",
                )

            return None

        except Exception as e:
            logger.error(f"提取回复信息失败: {str(e)}")
            return None

    def _extract_mentions(self, content: str) -> List[str]:
        """提取@提及的用户"""
        try:
            mentions = self.mention_pattern.findall(content)
            return list(set(mentions))  # 去重
        except Exception as e:
            logger.error(f"提取@提及失败: {str(e)}")
            return []

    def _classify_message_type(self, content: str) -> MessageType:
        """分类消息类型"""
        try:
            content_lower = content.lower()

            # 检查是否为问题
            if self._has_question(content):
                return MessageType.QUESTION

            # 检查是否为通知类消息
            notification_keywords = ["通知", "提醒", "公告", "会议", "截止"]
            if any(keyword in content for keyword in notification_keywords):
                return MessageType.NOTIFICATION

            # 检查是否为讨论
            discussion_keywords = ["讨论", "建议", "方案", "想法", "观点"]
            if any(keyword in content for keyword in discussion_keywords):
                return MessageType.DISCUSSION

            # 默认为闲聊
            return MessageType.CASUAL

        except Exception as e:
            logger.error(f"消息类型分类失败: {str(e)}")
            return MessageType.CASUAL

    def _has_question(self, content: str) -> bool:
        """检测消息是否包含问题"""
        try:
            for pattern in self.question_patterns:
                if re.search(pattern, content):
                    return True
            return False
        except Exception as e:
            logger.error(f"问题检测失败: {str(e)}")
            return False

    def _extract_keywords(self, content: str) -> List[str]:
        """提取关键词（简单版本）"""
        try:
            keywords = []

            # 提取中文、英文、数字
            for pattern in self.keyword_patterns:
                matches = re.findall(pattern, content)
                keywords.extend(matches)

            # 过滤短词和常用词
            filtered_keywords = []
            stop_words = {
                "的",
                "了",
                "是",
                "在",
                "有",
                "和",
                "就",
                "都",
                "也",
                "要",
                "会",
                "可以",
                "这",
                "那",
            }

            for keyword in keywords:
                if len(keyword) > 1 and keyword not in stop_words:
                    filtered_keywords.append(keyword)

            # 去重并限制数量
            return list(set(filtered_keywords))[:10]

        except Exception as e:
            logger.error(f"关键词提取失败: {str(e)}")
            return []

    def check_user_continuity(
        self,
        current_message: ChatMessage,
        previous_messages: List[ChatMessage],
        window_minutes: int = 5,
    ) -> bool:
        """
        检查用户是否连续发言

        Args:
            current_message: 当前消息
            previous_messages: 之前的消息列表
            window_minutes: 时间窗口（分钟）

        Returns:
            bool: 是否为连续发言
        """
        try:
            if not previous_messages:
                return False

            current_time = datetime.fromtimestamp(
                int(current_message.create_time) / 1000
            )
            time_threshold = current_time - timedelta(minutes=window_minutes)

            # 检查时间窗口内是否有同一用户的消息
            for msg in previous_messages:
                msg_time = datetime.fromtimestamp(int(msg.create_time) / 1000)
                if (
                    msg_time >= time_threshold
                    and msg.user_id == current_message.user_id
                    and msg.message_id != current_message.message_id
                ):
                    return True

            return False

        except Exception as e:
            logger.error(f"用户连续性检查失败: {str(e)}")
            return False
