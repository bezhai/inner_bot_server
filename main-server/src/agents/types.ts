import { BaseMessage } from '@langchain/core/messages';

/**
 * Agent配置接口
 */
export interface AgentConfig {
    /** 模型名称，如 "gpt-4", "claude-3-sonnet" 等 */
    modelName: string;
    /** API密钥 */
    apiKey: string;
    /** API基础URL */
    baseUrl?: string;
    /** 温度参数，控制输出随机性 */
    temperature?: number;
    /** 最大token数 */
    maxTokens?: number;
}

/**
 * Agent状态接口
 */
export interface AgentState {
    /** 消息历史 */
    messages: BaseMessage[];
    /** 当前活跃的agent名称 */
    currentAgent?: string;
    /** 下一个要切换到的agent */
    nextAgent?: string;
    /** 额外的状态数据 */
    metadata?: Record<string, any>;
}

/**
 * 工具调用结果
 */
export interface ToolCallResult {
    /** 工具名称 */
    toolName: string;
    /** 工具输入 */
    input: any;
    /** 工具输出 */
    output: any;
    /** 是否成功 */
    success: boolean;
    /** 错误信息（如果有） */
    error?: string;
}

/**
 * 流式输出事件类型
 */
export type StreamEvent = 
    | { type: 'message_start'; data: { messageId: string } }
    | { type: 'message_chunk'; data: { content: string; messageId: string } }
    | { type: 'message_end'; data: { messageId: string } }
    | { type: 'tool_call_start'; data: { toolName: string; input: any } }
    | { type: 'tool_call_end'; data: ToolCallResult }
    | { type: 'agent_switch'; data: { fromAgent: string; toAgent: string } }
    | { type: 'error'; data: { error: string } }
    | { type: 'final_result'; data: { result: any } };

/**
 * 输出模式
 */
export enum OutputMode {
    /** 流式返回所有内容 */
    STREAMING = 'streaming',
    /** 仅返回最终结果 */
    FINAL_ONLY = 'final_only'
}

/**
 * Agent运行选项
 */
export interface AgentRunOptions {
    /** 输出模式 */
    outputMode: OutputMode;
    /** 最大迭代次数 */
    maxIterations?: number;
    /** 超时时间（毫秒） */
    timeout?: number;
}

/**
 * Agent运行结果
 */
export interface AgentRunResult {
    /** 最终消息 */
    finalMessage?: BaseMessage;
    /** 所有消息历史 */
    messages: BaseMessage[];
    /** 工具调用结果 */
    toolCalls: ToolCallResult[];
    /** 是否成功完成 */
    success: boolean;
    /** 错误信息（如果有） */
    error?: string;
    /** 元数据 */
    metadata?: Record<string, any>;
}

/**
 * Multi-Agent配置
 */
export interface MultiAgentConfig {
    /** Agent列表 */
    agents: Record<string, AgentConfig & { 
        name: string; 
        description: string; 
        tools: any[];
        prompt?: string;
    }>;
    /** 默认的起始Agent */
    defaultAgent: string;
    /** 监督者Agent配置 */
    supervisorConfig?: AgentConfig & {
        prompt?: string;
    };
}