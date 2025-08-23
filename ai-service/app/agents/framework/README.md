# Agent Framework

适合本项目的 Agent 框架，提供模块化和可扩展的 Agent 构建能力。

## 🏗️ 架构概览

```
Agent Framework
├── adapters/           # 适配器层
│   ├── model.py       # 模型适配层 (OpenAI/Ollama)
│   ├── tool.py        # 工具适配层 (标签/MCP支持)
│   └── memory.py      # 内存适配层 (短期/长期/工作记忆)
├── core/              # 核心组件
│   ├── agent.py       # 基础Agent类 (Simple/React)
│   ├── node.py        # Agent节点 (编排单元)
│   └── orchestrator.py # 节点编排器 (工作流管理)
├── integration.py     # 服务集成适配器
├── examples.py        # 使用示例
└── README.md         # 本文档
```

## 🚀 核心特性

### 1. 模型适配层 (ModelAdapter)
- **统一接口**: 支持 OpenAI 和 Ollama (预留)
- **回退机制**: 多模型自动切换
- **流式输出**: 完整的流式响应支持

```python
from app.agents.framework.adapters.model import ModelAdapter, ModelConfig, ModelProvider

# 创建模型配置
config = ModelConfig(
    model_id="302.ai/gpt-4.1",
    provider=ModelProvider.OPENAI,
    temperature=0.7
)

# 使用适配器
adapter = get_model_adapter()
async for chunk in adapter.chat_completion_stream(messages, config):
    print(chunk.content)
```

### 2. 工具适配层 (ToolAdapter)
- **标签系统**: 基于标签的工具分类和过滤
- **装饰器扩展**: 扩展现有 `@tool` 装饰器，支持 `@tagged_tool`
- **智能推断**: 自动推断工具标签
- **MCP 支持**: 预留 MCP 协议集成

```python
from app.agents.framework.adapters.tool import tagged_tool, ToolTag, ToolFilter

# 使用新的标签装饰器
@tagged_tool([ToolTag.BANGUMI, ToolTag.SEARCH])
async def search_anime(query: str) -> str:
    """搜索动漫信息"""
    return f"搜索结果: {query}"

# 创建工具过滤器
tool_filter = ToolFilter(
    include_tags={ToolTag.BANGUMI, ToolTag.SEARCH},
    enabled_only=True
)

# 获取过滤后的工具
adapter = get_tool_adapter()
tools = adapter.get_tools_schema(tool_filter)
```

### 3. 内存适配层 (MemoryAdapter)
- **直接复用**: 完全复用现有的 `MessageContext` 实现
- **简单包装**: 提供统一的接口调用现有服务
- **Memory 服务**: 直接调用 `memory_client.quick_search`

```python
from app.agents.framework.adapters.memory import get_memory_adapter

# 获取对话上下文（直接使用现有实现）
adapter = get_memory_adapter()
messages = await adapter.get_conversation_context(
    message_id="msg_123",
    prompt_generator=lambda param: "系统提示词"
)
```

### 4. 基础 Agent 层
- **SimpleAgent**: 基本的 LLM 流式输出
- **ReactAgent**: 支持工具调用的推理-行动循环
- **可配置**: 灵活的配置系统

```python
from app.agents.framework.core.agent import AgentConfig, create_agent
from app.agents.framework.adapters.model import ModelConfig, ModelProvider

# 创建 React Agent
config = AgentConfig(
    name="智能助手",
    description="我是一个可以使用工具的AI助手",
    model_configs=[ModelConfig(
        model_id="302.ai/gpt-4.1",
        provider=ModelProvider.OPENAI
    )],
    tool_filter=ToolFilter(enabled_only=True),
    max_iterations=5
)

agent = create_agent("react", config)

# 流式处理
async for chunk in agent.process_stream("帮我查询天气", {"message_id": "123"}):
    print(chunk.content)
```

### 5. 节点编排系统
- **AgentNode**: 将 Agent 封装成可编排的节点
- **NodeOrchestrator**: 工作流管理器
- **流式支持**: 完整的流式编排

```python
from app.agents.framework.core.node import NodeConfig, AgentNode
from app.agents.framework.core.orchestrator import WorkflowConfig, NodeOrchestrator

# 创建工作流
workflow_config = WorkflowConfig(
    name="测试工作流",
    start_node="greeting",
    end_nodes=["summary"]
)

orchestrator = NodeOrchestrator(workflow_config)

# 添加节点
greeting_node = AgentNode(
    config=NodeConfig(node_id="greeting", name="问候节点"),
    agent=greeting_agent
)
orchestrator.add_node(greeting_node)

# 执行工作流
async for chunk in orchestrator.execute_stream("用户消息"):
    print(chunk.content)
```

## 🔧 使用方式

### 1. 快速开始

```python
from app.agents.framework.integration import get_framework_service

# 获取框架服务
framework = await get_framework_service()

# 使用预定义的 Agent
async for chunk in framework.process_with_agent(
    "react", 
    "帮我查询进击的巨人的信息",
    {"message_id": "test_123"}
):
    if chunk.content:
        print(chunk.content)
```

### 2. 替换现有服务

```python
from app.agents.framework.integration import get_framework_service

# 在现有的 chat_service 中使用
framework = await get_framework_service()

async for chunk in framework.replace_current_chat_service(
    message_id="msg_123",
    agent_type="react"
):
    yield chunk
```

## 🎯 预定义 Agent

框架提供了三种预定义的 Agent：

### 1. Simple Agent
- **用途**: 基本对话
- **特点**: 无工具调用，纯 LLM 对话
- **适用**: 简单问答场景

### 2. React Agent  
- **用途**: 智能助手
- **特点**: 支持工具调用，推理-行动循环
- **适用**: 复杂任务处理

### 3. Bangumi Agent
- **用途**: ACG 专用助手
- **特点**: 仅使用 Bangumi 相关工具
- **适用**: 动漫游戏查询

## 🔄 与现有系统的集成

### 兼容性
- ✅ 完全兼容现有的 `ChatStreamChunk` 类型
- ✅ 复用现有的工具系统 (`app.tools`)
- ✅ 兼容现有的内存服务 (`MessageContext`, `QdrantService`)
- ✅ 支持现有的模型服务 (`ModelService`)

### 迁移路径
1. **渐进式迁移**: 可以逐步替换现有的 Agent 实现
2. **并行运行**: 新旧系统可以同时运行
3. **配置驱动**: 通过配置切换使用新框架

## 🧪 测试和示例

运行示例代码：

```bash
cd ai-service
python -m app.agents.framework.examples
```

## 🚧 未来扩展

### 短期计划
- [ ] 完善 Ollama 模型提供商实现
- [ ] 实现完整的 MCP 协议支持
- [ ] 增强内存系统与 Qdrant 的集成
- [ ] 添加更多预定义工具标签

### 长期规划
- [ ] 可视化工作流编辑器
- [ ] 动态 Agent 配置热更新
- [ ] 分布式 Agent 执行支持
- [ ] 更复杂的条件编排逻辑

## 🤝 贡献指南

1. 所有新功能都应该有对应的测试
2. 保持与现有系统的兼容性
3. 遵循项目的代码规范 (TypeHint, 异步优先)
4. 更新相关文档

## 📝 变更日志

### v1.0.0 (当前版本)
- ✅ 基础框架架构完成
- ✅ 模型、工具、内存适配层实现
- ✅ Simple 和 React Agent 实现
- ✅ 节点编排系统实现
- ✅ 与现有服务集成适配器
- ✅ 完整的使用示例和文档