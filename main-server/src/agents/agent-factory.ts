import { BaseMessage, HumanMessage } from '@langchain/core/messages';
// import { Tool } from '@langchain/core/tools';
import { EventEmitter } from 'events';

import { BaseAgent } from './base-agent';
import { MultiAgent } from './multi-agent';
import {
    AgentConfig,
    AgentRunOptions,
    AgentRunResult,
    OutputMode,
    StreamEvent,
    MultiAgentConfig
} from './types';

/**
 * Agent工厂类
 * 提供统一的接口来创建和管理不同类型的agent
 */
export class AgentFactory {
    /**
     * 创建单一的ReAct Agent
     */
    public static createReactAgent(config: AgentConfig, tools: any[] = []): BaseAgent {
        return new BaseAgent(config, tools);
    }

    /**
     * 创建Multi-Agent系统
     */
    public static createMultiAgent(config: MultiAgentConfig): MultiAgent {
        return new MultiAgent(config);
    }

    /**
     * 创建简单的agent配置
     */
    public static createSimpleConfig(
        modelName: string,
        apiKey: string,
        baseUrl?: string,
        options?: {
            temperature?: number;
            maxTokens?: number;
        }
    ): AgentConfig {
        return {
            modelName,
            apiKey,
            baseUrl,
            temperature: options?.temperature ?? 0.7,
            maxTokens: options?.maxTokens
        };
    }

    /**
     * 从消息字符串数组创建BaseMessage数组
     */
    public static createMessages(messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>): BaseMessage[] {
        return messages.map(msg => {
            switch (msg.role) {
                case 'user':
                    return new HumanMessage(msg.content);
                case 'assistant':
                    return new HumanMessage(msg.content); // 这里可能需要AIMessage，但需要导入
                default:
                    return new HumanMessage(msg.content);
            }
        });
    }
}

/**
 * 统一的Agent接口
 * 对外暴露为单一的agent，内部可以是单一agent或multi-agent系统
 */
export class UnifiedAgent extends EventEmitter {
    private agent: BaseAgent | MultiAgent;
    private isMultiAgent: boolean;

    constructor(agent: BaseAgent | MultiAgent) {
        super();
        this.agent = agent;
        this.isMultiAgent = agent instanceof MultiAgent;
        
        // 转发事件
        this.agent.on('stream', (event: StreamEvent) => {
            this.emit('stream', event);
        });
        
        this.agent.on('error', (event: StreamEvent) => {
            this.emit('error', event);
        });
    }

    /**
     * 运行agent
     */
    public async run(
        messages: BaseMessage[] | Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
        options: AgentRunOptions = { outputMode: OutputMode.FINAL_ONLY }
    ): Promise<AgentRunResult> {
        // 如果传入的是简单消息格式，转换为BaseMessage
        const baseMessages = Array.isArray(messages) && messages.length > 0 && typeof messages[0] === 'object' && 'role' in messages[0]
            ? AgentFactory.createMessages(messages as Array<{ role: 'user' | 'assistant' | 'system'; content: string }>)
            : messages as BaseMessage[];

        return await this.agent.run(baseMessages, options);
    }

    /**
     * 添加工具（仅对单一agent有效）
     */
    public addTool(tool: any): void {
        if (this.agent instanceof BaseAgent) {
            this.agent.addTool(tool);
        } else {
            throw new Error('Cannot add tool to multi-agent system. Use agent-specific configuration.');
        }
    }

    /**
     * 添加多个工具（仅对单一agent有效）
     */
    public addTools(tools: any[]): void {
        if (this.agent instanceof BaseAgent) {
            this.agent.addTools(tools);
        } else {
            throw new Error('Cannot add tools to multi-agent system. Use agent-specific configuration.');
        }
    }

    /**
     * 获取agent类型
     */
    public getType(): 'single' | 'multi' {
        return this.isMultiAgent ? 'multi' : 'single';
    }

    /**
     * 获取底层agent实例
     */
    public getAgent(): BaseAgent | MultiAgent {
        return this.agent;
    }

    /**
     * 创建流式监听器
     */
    public createStreamListener(): {
        onStream: (callback: (event: StreamEvent) => void) => void;
        onError: (callback: (event: StreamEvent) => void) => void;
        onComplete: (callback: (result: AgentRunResult) => void) => void;
    } {
        const streamCallbacks: Array<(event: StreamEvent) => void> = [];
        const errorCallbacks: Array<(event: StreamEvent) => void> = [];
        const completeCallbacks: Array<(result: AgentRunResult) => void> = [];

        this.on('stream', (event: StreamEvent) => {
            streamCallbacks.forEach(callback => callback(event));
            
            if (event.type === 'final_result') {
                completeCallbacks.forEach(callback => callback(event.data.result));
            }
        });

        this.on('error', (event: StreamEvent) => {
            errorCallbacks.forEach(callback => callback(event));
        });

        return {
            onStream: (callback) => streamCallbacks.push(callback),
            onError: (callback) => errorCallbacks.push(callback),
            onComplete: (callback) => completeCallbacks.push(callback)
        };
    }
}