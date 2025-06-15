"""
智能记忆管理功能测试
"""

import asyncio
import logging
from datetime import datetime

from app.types.chat import ChatMessage
from app.types.memory import MessageFeatures, MessageType
from app.services.chat.memory.message_analyzer import MessageAnalyzer
from app.services.chat.memory.relevance_scorer import RelevanceScorer
from app.config.memory_config import memory_config

# 设置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def create_test_message(
    message_id: str, user_id: str, content: str, timestamp: int = None
) -> ChatMessage:
    """创建测试消息"""
    if timestamp is None:
        timestamp = int(datetime.now().timestamp() * 1000)

    return ChatMessage(
        message_id=message_id,
        user_id=user_id,
        chat_id="test_chat",
        content=content,
        create_time=str(timestamp),
        user_name=f"User_{user_id}",
        role="user",
    )


async def test_message_analyzer():
    """测试消息分析器"""
    logger.info("=== 测试消息分析器 ===")

    analyzer = MessageAnalyzer()

    # 测试不同类型的消息
    test_messages = [
        create_test_message("1", "user1", "你好，大家好！"),
        create_test_message("2", "user2", "这个项目的进度怎么样？", timestamp=1000002),
        create_test_message("3", "user1", "@user2 我觉得还不错", timestamp=1000003),
        create_test_message("4", "user3", "有什么技术难点吗？", timestamp=1000004),
        create_test_message("5", "user2", "主要是数据库设计", timestamp=1000005),
    ]

    for msg in test_messages:
        features = analyzer.analyze_message(msg)
        logger.info(f"消息: {msg.content}")
        logger.info(f"  类型: {features.message_type}")
        logger.info(f"  有问题: {features.has_question}")
        logger.info(f"  @提及: {features.mentions}")
        logger.info(f"  关键词: {features.keywords}")
        logger.info("---")


async def test_relevance_scorer():
    """测试相关性评分器"""
    logger.info("=== 测试相关性评分器 ===")

    analyzer = MessageAnalyzer()
    scorer = RelevanceScorer()

    # 创建目标消息
    target_msg = create_test_message(
        "target", "user1", "关于项目进度的问题？", timestamp=1000010
    )
    target_features = analyzer.analyze_message(target_msg)

    # 创建候选消息
    candidates = [
        create_test_message("c1", "user2", "项目进度很顺利", timestamp=1000005),
        create_test_message("c2", "user3", "今天天气不错", timestamp=1000006),
        create_test_message("c3", "user1", "我们需要讨论一下", timestamp=1000007),
        create_test_message("c4", "user2", "@user1 好的，关于进度", timestamp=1000008),
    ]

    candidate_features = [analyzer.analyze_message(msg) for msg in candidates]

    # 计算相关性
    for i, features in enumerate(candidate_features):
        score = scorer.calculate_relevance(target_features, features)
        logger.info(f"候选消息 {i+1}: {candidates[i].content}")
        logger.info(f"  总分: {score.total_score:.3f}")
        logger.info(f"  回复链: {score.reply_chain_score:.3f}")
        logger.info(f"  用户连续: {score.user_continuity_score:.3f}")
        logger.info(f"  时间衰减: {score.time_decay_score:.3f}")
        logger.info(f"  @关系: {score.mention_relation_score:.3f}")
        logger.info(f"  关键词: {score.keyword_overlap_score:.3f}")
        logger.info("---")


async def test_config():
    """测试配置"""
    logger.info("=== 测试配置 ===")

    logger.info(f"智能记忆系统已启用，最大上下文: {memory_config.max_context_messages}")
    logger.info(f"最大上下文消息数: {memory_config.max_context_messages}")
    logger.info(f"时间窗口: {memory_config.time_window_hours} 小时")
    logger.info(f"相关性阈值: {memory_config.relevance_threshold}")
    logger.info(f"权重配置:")
    logger.info(f"  回复链: {memory_config.reply_chain_weight}")
    logger.info(f"  用户连续: {memory_config.user_continuity_weight}")
    logger.info(f"  时间衰减: {memory_config.time_decay_weight}")
    logger.info(f"  @关系: {memory_config.mention_relation_weight}")
    logger.info(f"  关键词: {memory_config.keyword_overlap_weight}")


async def main():
    """主测试函数"""
    logger.info("开始智能记忆管理功能测试")

    try:
        await test_config()
        await test_message_analyzer()
        await test_relevance_scorer()

        logger.info("所有测试完成！")

    except Exception as e:
        logger.error(f"测试失败: {str(e)}")


if __name__ == "__main__":
    asyncio.run(main())
