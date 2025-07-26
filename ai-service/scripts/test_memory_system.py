#!/usr/bin/env python3
"""
测试记忆系统功能

[DEPRECATED] 此脚本中的EnhancedContextService测试已被废弃
现在使用Memory服务的/api/v1/memory/quick_search接口
"""

import asyncio
import os
import sys
from datetime import datetime

# 添加项目根目录到Python路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services.chat.memory.data_collector import DataCollector
from app.services.chat.memory.message_analyzer import MessageAnalyzer
from app.services.chat.memory.relevance_scorer import RelevanceScorer
from app.types.chat import ChatMessage

# from app.services.chat.memory.context_builder import EnhancedContextService  # 已废弃


async def test_memory_components():
    """
    测试记忆系统的各个组件
    """
    print("=== 测试记忆系统组件 ===")

    # 测试消息分析器
    analyzer = MessageAnalyzer()

    # 创建测试消息
    test_message = ChatMessage(
        user_id="test_user",
        user_name="测试用户",
        content="这是一个测试消息，包含一些关键词",
        is_mention_bot=True,
        role="user",
        message_id="test_msg_001",
        chat_id="test_chat",
        chat_type="group",
        create_time=str(int(datetime.now().timestamp() * 1000)),
    )

    # 测试消息分析
    features = analyzer.analyze_message(test_message)
    print(f"消息特征分析结果: {features}")

    # 测试相关性评分器
    scorer = RelevanceScorer()
    print("相关性评分器初始化成功")

    # 测试数据收集器
    collector = DataCollector()
    print("数据收集器初始化成功")

    # 原先的EnhancedContextService测试已被废弃
    # 现在应该使用Memory服务进行测试
    print("\n[废弃提醒] EnhancedContextService已被废弃，现在使用Memory服务")
    print("如需测试上下文构建，请使用 app/core/clients/memory_client.py")

    print("\n=== 测试完成 ===")


if __name__ == "__main__":
    asyncio.run(test_memory_components())
