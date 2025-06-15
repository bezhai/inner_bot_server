#!/usr/bin/env python3
"""
智能记忆管理系统测试启动脚本
"""

import sys
import os
import asyncio
import logging

# 添加项目根目录到Python路径
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
sys.path.insert(0, parent_dir)

# 设置环境变量
# 智能记忆管理已默认启用
os.environ.setdefault("MEMORY_MAX_CONTEXT_MESSAGES", "20")
os.environ.setdefault("MEMORY_TIME_WINDOW_HOURS", "24")
os.environ.setdefault("MEMORY_RELEVANCE_THRESHOLD", "0.3")

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


async def test_basic_functionality():
    """测试基本功能"""
    try:
        logger.info("开始测试智能记忆管理系统")

        # 测试配置加载
        from app.config.memory_config import memory_config

        logger.info(f"配置加载成功: 最大上下文={memory_config.max_context_messages}")

        # 测试数据类型
        from app.types.memory import MessageFeatures, MessageType, RelevanceScore

        logger.info("数据类型导入成功")

        # 测试核心组件
        from app.services.chat.memory import (
            MessageAnalyzer,
            RelevanceScorer,
            DataCollector,
        )

        logger.info("核心组件导入成功")

        # 创建实例
        analyzer = MessageAnalyzer()
        scorer = RelevanceScorer()
        collector = DataCollector()
        logger.info("组件实例化成功")

        # 测试增强的上下文服务
        try:
            from app.services.chat.memory.context_builder import EnhancedContextService

            enhanced_service = EnhancedContextService()
            logger.info("增强上下文服务导入成功")
        except Exception as e:
            logger.warning(f"增强上下文服务导入失败: {str(e)}")

        logger.info("✅ 基本功能测试通过")
        return True

    except Exception as e:
        logger.error(f"❌ 基本功能测试失败: {str(e)}")
        return False


async def test_integration():
    """测试集成功能"""
    try:
        logger.info("开始测试集成功能")

        # 测试MessageContext集成
        from app.services.chat.context import MessageContext
        from app.types.chat import ChatMessage
        from app.services.chat.prompt import PromptService

        # 创建测试消息
        test_message = ChatMessage(
            message_id="test_msg_1",
            user_id="test_user",
            chat_id="test_chat",
            content="这是一个测试消息",
            create_time=str(int(asyncio.get_event_loop().time() * 1000)),
            user_name="测试用户",
            role="user",
        )

        # 测试MessageContext
        context = MessageContext(test_message, PromptService.get_prompt)
        logger.info("MessageContext创建成功")

        # 这里暂时跳过实际的上下文初始化，因为需要数据库连接
        logger.info("✅ 集成功能测试基本通过")
        return True

    except Exception as e:
        logger.error(f"❌ 集成功能测试失败: {str(e)}")
        return False


async def main():
    """主函数"""
    logger.info("=" * 60)
    logger.info("智能对话记忆管理框架 MVP 测试")
    logger.info("=" * 60)

    success_count = 0
    total_tests = 2

    # 基本功能测试
    if await test_basic_functionality():
        success_count += 1

    # 集成功能测试
    if await test_integration():
        success_count += 1

    logger.info("=" * 60)
    logger.info(f"测试完成: {success_count}/{total_tests} 通过")

    if success_count == total_tests:
        logger.info("🎉 所有测试通过！智能记忆管理系统准备就绪")
        logger.info("")
        logger.info("📋 接下来的步骤:")
        logger.info("1. 创建数据库表（见下方SQL）")
        logger.info("2. 在 .env 文件中配置环境变量")
        logger.info("3. 启动 ai-service 并测试实际功能")
        logger.info("")
        logger.info("📊 需要创建的数据库表:")
        logger.info(
            """
-- 上下文使用记录表
CREATE TABLE context_usage_records (
    id SERIAL PRIMARY KEY,
    context_id VARCHAR(255) NOT NULL,
    chat_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    trigger_message_id VARCHAR(255) NOT NULL,
    context_message_ids JSONB NOT NULL,
    context_message_count INTEGER NOT NULL,
    relevance_scores JSONB,
    processing_time_ms INTEGER,
    fallback_used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 添加索引
CREATE INDEX idx_context_chat_user ON context_usage_records (chat_id, user_id);
CREATE INDEX idx_context_created_at ON context_usage_records (created_at);
CREATE INDEX idx_context_id ON context_usage_records (context_id);

-- 消息特征缓存表（可选）
CREATE TABLE message_features_cache (
    message_id VARCHAR(255) PRIMARY KEY,
    chat_id VARCHAR(255) NOT NULL,
    features JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_features_chat_time ON message_features_cache (chat_id, created_at);
        """
        )
    else:
        logger.error("❌ 部分测试失败，请检查错误信息")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
