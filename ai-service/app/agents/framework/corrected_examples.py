"""
修正后的 Agent Framework 使用示例
正确复用现有的工具和内存系统
"""

import asyncio
import logging
from typing import Dict, Any

from .adapters.model import ModelConfig, ModelProvider
from .adapters.tool import ToolFilter, ToolTag, tagged_tool
from .core.agent import AgentConfig, create_agent
from .integration import get_framework_service

logger = logging.getLogger(__name__)


# 示例：使用新的标签装饰器创建工具
@tagged_tool([ToolTag.BANGUMI, ToolTag.SEARCH], name="anime_search")
async def search_anime_example(query: str) -> str:
    """
    搜索动漫信息的示例工具
    
    Args:
        query: 搜索关键词
    
    Returns:
        搜索结果
    """
    return f"找到动漫: {query} 的相关信息"


@tagged_tool([ToolTag.WEB, ToolTag.SEARCH])
async def web_search_example(query: str) -> str:
    """
    网络搜索示例工具
    
    Args:
        query: 搜索关键词
    
    Returns:
        搜索结果
    """
    return f"网络搜索结果: {query}"


async def example_tagged_tools():
    """展示标签工具的使用"""
    print("=== 标签工具示例 ===")
    
    from .adapters.tool import get_tool_adapter
    
    # 获取工具适配器
    adapter = get_tool_adapter()
    
    # 测试不同的工具过滤器
    filters = [
        ToolFilter(include_tags={ToolTag.BANGUMI}, enabled_only=True),
        ToolFilter(include_tags={ToolTag.WEB}, enabled_only=True),
        ToolFilter(exclude_tags={ToolTag.DEBUG}, enabled_only=True),
    ]
    
    for i, tool_filter in enumerate(filters, 1):
        print(f"\n--- 过滤器 {i} ---")
        tools = adapter.list_tools(tool_filter)
        print(f"找到 {len(tools)} 个工具:")
        for tool in tools:
            print(f"  - {tool.name}: {tool.tags}")


async def example_memory_adapter():
    """展示内存适配器的使用"""
    print("=== 内存适配器示例 ===")
    
    from .adapters.memory import get_memory_adapter
    
    # 获取内存适配器
    adapter = get_memory_adapter()
    
    # 模拟获取对话上下文
    message_id = "test_message_123"
    prompt_generator = lambda param: "我是测试助手"
    
    try:
        messages = await adapter.get_conversation_context(message_id, prompt_generator)
        print(f"获取到 {len(messages)} 条上下文消息")
        for msg in messages[:3]:  # 只显示前3条
            print(f"  - {msg.get('role', 'unknown')}: {msg.get('content', '')[:50]}...")
    except Exception as e:
        print(f"获取上下文失败: {e}")


async def example_correct_agent_usage():
    """展示正确的 Agent 使用方式"""
    print("=== 正确的 Agent 使用示例 ===")
    
    # 创建模型配置
    model_configs = [
        ModelConfig(
            model_id="302.ai/gpt-4o-mini",
            provider=ModelProvider.OPENAI,
            temperature=0.7
        )
    ]
    
    # 创建带标签过滤的 Agent 配置
    agent_config = AgentConfig(
        name="Bangumi专家",
        description="我是专门处理动漫相关查询的助手",
        model_configs=model_configs,
        tool_filter=ToolFilter(include_tags={ToolTag.BANGUMI}, enabled_only=True),
        max_iterations=3,
        enable_memory=True
    )
    
    # 创建 Agent
    agent = create_agent("react", agent_config)
    
    # 测试对话
    message = "帮我搜索进击的巨人"
    context = {"message_id": "test_bangumi_123"}
    
    print(f"用户: {message}")
    print("助手: ", end="", flush=True)
    
    try:
        async for chunk in agent.process_stream(message, context):
            if chunk.content:
                print(chunk.content, end="", flush=True)
            elif chunk.tool_call_feedback:
                print(f"\n[{chunk.tool_call_feedback.status_message}]", flush=True)
        print("\n")
    except Exception as e:
        print(f"处理失败: {e}")


async def example_framework_service_usage():
    """展示框架服务的正确使用"""
    print("=== 框架服务使用示例 ===")
    
    try:
        # 获取框架服务
        framework = await get_framework_service()
        
        # 测试不同类型的 Agent
        test_cases = [
            ("simple", "你好，请简单介绍一下自己"),
            ("react", "帮我搜索一些信息"),
        ]
        
        for agent_type, message in test_cases:
            print(f"\n--- 测试 {agent_type} Agent ---")
            print(f"用户: {message}")
            print("助手: ", end="", flush=True)
            
            context = {"message_id": f"test_{agent_type}_456"}
            
            try:
                async for chunk in framework.process_with_agent(agent_type, message, context):
                    if chunk.content:
                        print(chunk.content, end="", flush=True)
                    elif chunk.tool_call_feedback:
                        print(f"\n[{chunk.tool_call_feedback.status_message}]", flush=True)
                print("\n")
            except Exception as e:
                print(f"处理失败: {e}")
                
    except Exception as e:
        print(f"框架服务初始化失败: {e}")


async def run_corrected_examples():
    """运行修正后的示例"""
    print("🔧 修正后的 Agent Framework 示例\n")
    
    try:
        await example_tagged_tools()
        await example_memory_adapter()
        await example_correct_agent_usage()
        await example_framework_service_usage()
        
        print("✅ 修正后的示例执行完成！")
        
    except Exception as e:
        logger.error(f"示例执行失败: {e}")
        print(f"❌ 示例执行失败: {e}")


if __name__ == "__main__":
    # 配置日志
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )
    
    # 运行示例
    asyncio.run(run_corrected_examples())