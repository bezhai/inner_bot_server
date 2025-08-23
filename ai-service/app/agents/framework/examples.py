"""
Agent Framework 使用示例
"""

import asyncio
import logging
from typing import Dict, Any

from .adapters.model import ModelConfig, ModelProvider
from .adapters.tool import ToolFilter, ToolTag
from .core.agent import AgentConfig, create_agent
from .core.node import NodeConfig, AgentNode
from .core.orchestrator import WorkflowConfig, NodeOrchestrator, Edge
from .integration import get_framework_service

logger = logging.getLogger(__name__)


async def example_simple_agent():
    """简单 Agent 示例"""
    print("=== 简单 Agent 示例 ===")
    
    # 创建模型配置
    model_config = ModelConfig(
        model_id="302.ai/gpt-4o-mini",
        provider=ModelProvider.OPENAI,
        temperature=0.7
    )
    
    # 创建 Agent 配置
    agent_config = AgentConfig(
        name="测试助手",
        description="我是一个测试用的AI助手。",
        model_configs=[model_config],
        enable_memory=False
    )
    
    # 创建 Agent
    agent = create_agent("simple", agent_config)
    
    # 测试对话
    message = "你好，请介绍一下自己"
    context = {"test": True}
    
    print(f"用户: {message}")
    print("助手: ", end="", flush=True)
    
    async for chunk in agent.process_stream(message, context):
        if chunk.content:
            print(chunk.content, end="", flush=True)
    
    print("\n")


async def example_react_agent():
    """React Agent 示例"""
    print("=== React Agent 示例 ===")
    
    # 创建模型配置
    model_configs = [
        ModelConfig(
            model_id="302.ai/gpt-4o-mini",
            provider=ModelProvider.OPENAI,
            temperature=0.7
        )
    ]
    
    # 创建带工具的 Agent 配置
    agent_config = AgentConfig(
        name="智能助手",
        description="我是一个可以使用工具的智能助手。",
        model_configs=model_configs,
        tool_filter=ToolFilter(enabled_only=True),
        max_iterations=3,
        enable_memory=False
    )
    
    # 创建 Agent
    agent = create_agent("react", agent_config)
    
    # 测试工具调用
    message = "帮我查询一下进击的巨人的相关信息"
    context = {"test": True}
    
    print(f"用户: {message}")
    print("助手: ", end="", flush=True)
    
    async for chunk in agent.process_stream(message, context):
        if chunk.content:
            print(chunk.content, end="", flush=True)
        elif chunk.tool_call_feedback:
            print(f"\n[工具调用: {chunk.tool_call_feedback.name}]", flush=True)
    
    print("\n")


async def example_workflow():
    """工作流示例"""
    print("=== 工作流示例 ===")
    
    # 创建工作流配置
    workflow_config = WorkflowConfig(
        name="测试工作流",
        description="一个简单的测试工作流",
        start_node="greeting",
        end_nodes=["summary"],
        max_steps=5
    )
    
    # 创建编排器
    orchestrator = NodeOrchestrator(workflow_config)
    
    # 创建问候节点
    greeting_config = AgentConfig(
        name="问候助手",
        description="我负责问候用户并了解他们的需求。",
        model_configs=[ModelConfig(
            model_id="302.ai/gpt-4o-mini",
            provider=ModelProvider.OPENAI,
            temperature=0.7
        )],
        enable_memory=False
    )
    
    greeting_agent = create_agent("simple", greeting_config)
    greeting_node = AgentNode(
        config=NodeConfig(
            node_id="greeting",
            name="问候节点",
            description="问候用户"
        ),
        agent=greeting_agent,
        input_transformer=lambda inp: f"请问候用户并询问：{inp.message}"
    )
    
    # 创建总结节点
    summary_config = AgentConfig(
        name="总结助手",
        description="我负责总结对话内容。",
        model_configs=[ModelConfig(
            model_id="302.ai/gpt-4o-mini",
            provider=ModelProvider.OPENAI,
            temperature=0.5
        )],
        enable_memory=False
    )
    
    summary_agent = create_agent("simple", summary_config)
    summary_node = AgentNode(
        config=NodeConfig(
            node_id="summary",
            name="总结节点",
            description="总结对话"
        ),
        agent=summary_agent,
        input_transformer=lambda inp: f"请总结以下对话内容：{inp.message}"
    )
    
    # 添加节点和边
    orchestrator.add_node(greeting_node)
    orchestrator.add_node(summary_node)
    orchestrator.add_edge(Edge(from_node="greeting", to_node="summary"))
    
    # 执行工作流
    message = "我想了解一些AI的知识"
    print(f"用户: {message}")
    print("工作流: ", end="", flush=True)
    
    async for chunk in orchestrator.execute_stream(message):
        if chunk.content:
            print(chunk.content, end="", flush=True)
    
    print("\n")


async def example_framework_service():
    """框架服务示例"""
    print("=== 框架服务示例 ===")
    
    # 获取框架服务
    framework = await get_framework_service()
    
    # 测试不同类型的 Agent
    test_cases = [
        ("simple", "你好，请简单介绍一下自己"),
        ("react", "帮我查询一下最新的动漫推荐"),
        ("bangumi", "我想了解《鬼灭之刃》的角色信息"),
    ]
    
    for agent_type, message in test_cases:
        print(f"\n--- 测试 {agent_type} Agent ---")
        print(f"用户: {message}")
        print("助手: ", end="", flush=True)
        
        context = {"test": True, "message_id": f"test_{agent_type}"}
        
        async for chunk in framework.process_with_agent(agent_type, message, context):
            if chunk.content:
                print(chunk.content, end="", flush=True)
            elif chunk.tool_call_feedback:
                print(f"\n[{chunk.tool_call_feedback.status_message}]", flush=True)
        
        print("\n")


async def run_all_examples():
    """运行所有示例"""
    print("🚀 Agent Framework 示例演示\n")
    
    try:
        await example_simple_agent()
        await example_react_agent()
        await example_workflow()
        await example_framework_service()
        
        print("✅ 所有示例执行完成！")
        
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
    asyncio.run(run_all_examples())