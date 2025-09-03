# LangGraph基础Agent系统

这是一个基于LangGraph实现的基础Agent系统，提供了灵活、可扩展的AI代理功能。

## 核心特性

### 🤖 基础功能
- **ReAct模式**: 支持推理和行动循环的智能代理
- **灵活配置**: 支持自定义model_name、api_key、base_url等参数
- **工具集成**: 支持添加任意数量的自定义工具
- **消息处理**: 支持多种消息格式输入

### 📡 输出模式
- **流式输出**: 实时返回所有内容，包括工具调用和消息生成过程
- **最终结果**: 仅返回最终的处理结果

### 🔄 Multi-Agent系统
- **代理切换**: 支持handoff模式在不同专业代理间切换
- **统一接口**: 将multi-agent系统对外暴露为单一代理
- **监督者模式**: 智能任务分配和代理协调

## 快速开始

### 1. 创建单一Agent

```typescript
import { AgentFactory, UnifiedAgent, OutputMode } from './agents';
import { availableTools } from './agents/tools';

// 创建配置
const config = AgentFactory.createSimpleConfig(
    'gpt-4',
    'your-api-key',
    'https://api.openai.com/v1'
);

// 创建agent
const agent = AgentFactory.createReactAgent(config, [
    availableTools.calculator,
    availableTools.getCurrentTime
]);

// 创建统一接口
const unifiedAgent = new UnifiedAgent(agent);

// 运行agent
const result = await unifiedAgent.run([
    { role: 'user', content: '请计算 15 * 23' }
], {
    outputMode: OutputMode.FINAL_ONLY
});
```

### 2. 流式输出模式

```typescript
// 设置流式监听器
const listener = unifiedAgent.createStreamListener();

listener.onStream((event) => {
    console.log(`[${event.type}]`, event.data);
});

listener.onComplete((result) => {
    console.log('完成:', result);
});

// 运行流式agent
const result = await unifiedAgent.run([
    { role: 'user', content: '搜索AI相关信息' }
], {
    outputMode: OutputMode.STREAMING
});
```

### 3. Multi-Agent系统

```typescript
import { MultiAgentConfig } from './agents';

// 配置multi-agent系统
const config: MultiAgentConfig = {
    agents: {
        math_expert: {
            name: 'math_expert',
            description: '数学计算专家',
            modelName: 'gpt-4',
            apiKey: 'your-api-key',
            tools: [calculatorTool],
            prompt: '你是数学专家...'
        },
        text_expert: {
            name: 'text_expert', 
            description: '文本处理专家',
            modelName: 'gpt-4',
            apiKey: 'your-api-key',
            tools: [textTool],
            prompt: '你是文本专家...'
        }
    },
    defaultAgent: 'math_expert'
};

// 创建multi-agent
const multiAgent = AgentFactory.createMultiAgent(config);
const unifiedAgent = new UnifiedAgent(multiAgent);

// 运行（会自动在代理间切换）
const result = await unifiedAgent.run([
    { role: 'user', content: '计算15*23，然后分析"Hello World"的字符数' }
]);
```

### 4. Agent管理器

```typescript
import { AgentManager } from './agents';

// 创建管理器
const manager = AgentManager.createPreconfiguredManager(
    'gpt-4',
    'your-api-key'
);

// 创建多个agent
manager.createSingleAgent('calc', {}, [calculatorTool]);
manager.createSingleAgent('time', {}, [timeTool]);

// 批量运行
const results = await manager.runMultipleAgents([
    { agentName: 'calc', messages: [{ role: 'user', content: '计算100/5' }] },
    { agentName: 'time', messages: [{ role: 'user', content: '现在几点？' }] }
]);
```

## API参考

### AgentConfig
```typescript
interface AgentConfig {
    modelName: string;      // 模型名称
    apiKey: string;         // API密钥
    baseUrl?: string;       // API基础URL
    temperature?: number;   // 温度参数
    maxTokens?: number;     // 最大token数
}
```

### AgentRunOptions
```typescript
interface AgentRunOptions {
    outputMode: OutputMode;     // 输出模式
    maxIterations?: number;     // 最大迭代次数
    timeout?: number;           // 超时时间
}
```

### StreamEvent类型
- `message_start`: 开始生成消息
- `message_chunk`: 消息内容块
- `message_end`: 消息生成完成
- `tool_call_start`: 开始工具调用
- `tool_call_end`: 工具调用完成
- `agent_switch`: 代理切换
- `error`: 错误事件
- `final_result`: 最终结果

## 自定义工具

```typescript
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

const customTool = tool(
    async (input: { param: string }) => {
        // 工具逻辑
        return `处理结果: ${input.param}`;
    },
    {
        name: 'custom_tool',
        description: '自定义工具描述',
        schema: z.object({
            param: z.string().describe('参数描述')
        })
    }
);
```

## 事件监听

```typescript
// 监听所有流式事件
unifiedAgent.on('stream', (event: StreamEvent) => {
    switch (event.type) {
        case 'tool_call_start':
            console.log('工具调用开始:', event.data);
            break;
        case 'agent_switch':
            console.log('代理切换:', event.data);
            break;
        // ... 其他事件类型
    }
});

// 监听错误
unifiedAgent.on('error', (event: StreamEvent) => {
    console.error('错误:', event.data.error);
});
```

## 测试

```typescript
import { runAllTests, quickValidationTest } from './test-agent';

// 快速验证（不需要API密钥）
quickValidationTest();

// 完整测试（需要有效的API密钥）
await runAllTests();
```

## 注意事项

1. **API密钥**: 确保设置正确的API密钥和基础URL
2. **错误处理**: 所有操作都有完整的错误处理机制
3. **资源清理**: 使用AgentManager时记得调用cleanup()
4. **并发控制**: Multi-Agent系统会自动处理代理间的协调
5. **工具安全**: 自定义工具时注意输入验证和安全性

## 架构设计

```
UnifiedAgent (统一接口)
    ├── BaseAgent (单一ReAct代理)
    │   ├── ChatOpenAI (语言模型)
    │   ├── Tools[] (工具集合)
    │   └── ReactAgent (LangGraph预构建代理)
    └── MultiAgent (多代理系统)
        ├── SupervisorAgent (监督者)
        ├── SpecializedAgents (专业代理)
        └── StateGraph (状态图)
```

这个系统设计为完全独立的模块，不依赖任何业务逻辑，可以在任何需要AI代理功能的场景中使用。