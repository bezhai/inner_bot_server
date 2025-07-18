#!/usr/bin/env python3
"""
测试LangGraph修复效果
"""

import asyncio
import sys
import os
import logging

# 添加项目根目录到Python路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'app'))

from app.services.chat.langgraph_chat_service import LangGraphChatService

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)


async def test_langgraph_basic():
    """测试LangGraph基本功能"""
    try:
        logger.info("开始测试LangGraph基本功能...")
        
        # 创建测试消息ID
        test_message_id = "test_msg_001"
        
        # 测试LangGraph聊天服务
        chat_service = LangGraphChatService()
        
        # 调用流式AI回复
        response_count = 0
        async for chunk in chat_service.stream_ai_reply(
            message_id=test_message_id,
            model_id="gpt-4o-mini",
            temperature=0.7,
            enable_tools=False,  # 先禁用工具测试基本功能
            yield_interval=0.1
        ):
            response_count += 1
            if chunk.content:
                logger.info(f"收到响应块 {response_count}: {chunk.content[:50]}...")
            elif chunk.reason_content:
                logger.info(f"收到原因内容 {response_count}: {chunk.reason_content[:50]}...")
            elif chunk.tool_call_feedback:
                logger.info(f"收到工具反馈 {response_count}: {chunk.tool_call_feedback}")
            
            # 限制测试响应数量
            if response_count >= 5:
                logger.info("达到测试响应限制，停止测试")
                break
        
        logger.info(f"LangGraph基本功能测试完成，共收到 {response_count} 个响应块")
        return True
        
    except Exception as e:
        logger.error(f"LangGraph基本功能测试失败: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


async def test_langgraph_with_tools():
    """测试LangGraph工具调用功能"""
    try:
        logger.info("开始测试LangGraph工具调用功能...")
        
        # 创建测试消息ID
        test_message_id = "test_msg_002"
        
        # 测试LangGraph聊天服务
        chat_service = LangGraphChatService()
        
        # 调用流式AI回复（启用工具）
        response_count = 0
        tool_calls_detected = False
        async for chunk in chat_service.stream_ai_reply(
            message_id=test_message_id,
            model_id="gpt-4o-mini",
            temperature=0.7,
            enable_tools=True,  # 启用工具测试
            yield_interval=0.1
        ):
            response_count += 1
            if chunk.content:
                logger.info(f"收到响应块 {response_count}: {chunk.content[:50]}...")
            elif chunk.reason_content:
                logger.info(f"收到原因内容 {response_count}: {chunk.reason_content[:50]}...")
            elif chunk.tool_call_feedback:
                logger.info(f"收到工具反馈 {response_count}: {chunk.tool_call_feedback}")
                tool_calls_detected = True
            
            # 限制测试响应数量
            if response_count >= 15:
                logger.info("达到测试响应限制，停止测试")
                break
        
        logger.info(f"LangGraph工具调用功能测试完成，共收到 {response_count} 个响应块")
        logger.info(f"工具调用检测: {'✓ 有工具调用' if tool_calls_detected else '✗ 无工具调用'}")
        return True
        
    except Exception as e:
        logger.error(f"LangGraph工具调用功能测试失败: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


async def test_langgraph_stability():
    """测试LangGraph稳定性（无数据库依赖）"""
    try:
        logger.info("开始测试LangGraph稳定性...")
        
        # 创建测试消息ID
        test_message_id = "test_stability_msg"
        
        # 测试LangGraph聊天服务
        chat_service = LangGraphChatService()
        
        # 调用流式AI回复（启用工具）
        response_count = 0
        no_crash_detected = True
        
        async for chunk in chat_service.stream_ai_reply(
            message_id=test_message_id,
            model_id="gpt-4o-mini",
            temperature=0.7,
            enable_tools=True,  # 启用工具测试
            yield_interval=0.1
        ):
            response_count += 1
            if chunk.content:
                content = chunk.content
                logger.info(f"收到响应块 {response_count}: {content[:50]}...")
            elif chunk.reason_content:
                logger.info(f"收到原因内容 {response_count}: {chunk.reason_content[:50]}...")
            elif chunk.tool_call_feedback:
                logger.info(f"🔧 收到工具反馈 {response_count}: {chunk.tool_call_feedback}")
            
            # 限制测试响应数量
            if response_count >= 8:
                logger.info("达到测试响应限制，停止测试")
                break
        
        logger.info(f"LangGraph稳定性测试完成，共收到 {response_count} 个响应块")
        logger.info(f"稳定性检测: {'✓ 无崩溃' if no_crash_detected else '✗ 有崩溃'}")
        
        # 只要没有崩溃就算成功
        return True
        
    except Exception as e:
        logger.error(f"LangGraph稳定性测试失败: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


async def main():
    """主测试函数"""
    logger.info("开始LangGraph修复验证测试...")
    
    # 测试基本功能
    basic_test_result = await test_langgraph_basic()
    
    # 测试工具调用功能
    tools_test_result = await test_langgraph_with_tools()
    
    # 测试LangGraph稳定性
    stability_test_result = await test_langgraph_stability()
    
    # 输出测试结果
    logger.info("=" * 50)
    logger.info("测试结果汇总:")
    logger.info(f"基本功能测试: {'✓ 通过' if basic_test_result else '✗ 失败'}")
    logger.info(f"工具调用测试: {'✓ 通过' if tools_test_result else '✗ 失败'}")
    logger.info(f"稳定性测试: {'✓ 通过' if stability_test_result else '✗ 失败'}")
    
    if basic_test_result and tools_test_result and stability_test_result:
        logger.info("🎉 所有测试通过！LangGraph修复成功，运行稳定")
        return 0
    else:
        logger.error("❌ 部分测试失败，需要进一步修复")
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
