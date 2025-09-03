/**
 * LangGraph基础Agent系统
 * 
 * 提供以下功能：
 * 1. 基础ReAct模式的agent
 * 2. 支持自定义model配置和工具
 * 3. 两种输出模式：流式返回和最终结果
 * 4. Multi-Agent系统和handoff模式
 * 5. 统一的对外接口
 */

// 类型定义
export * from './types';

// 基础Agent
export { BaseAgent } from './base-agent';

// Multi-Agent系统
export { MultiAgent } from './multi-agent';

// Agent工厂和统一接口
export { AgentFactory, UnifiedAgent } from './agent-factory';

// Agent管理器
export { AgentManager } from './agent-manager';

// Agent服务
export { AgentService, createAgentService } from './agent-service';

// 示例工具
export * from './tools';

// 便捷导入
export {
    AgentConfig,
    AgentState,
    AgentRunOptions,
    AgentRunResult,
    OutputMode,
    StreamEvent,
    MultiAgentConfig,
    ToolCallResult
} from './types';