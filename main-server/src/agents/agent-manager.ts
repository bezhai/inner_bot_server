import { EventEmitter } from 'events';
// import { Tool } from '@langchain/core/tools';
import { BaseMessage } from '@langchain/core/messages';

import { AgentFactory, UnifiedAgent } from './agent-factory';
import {
    AgentConfig,
    AgentRunOptions,
    AgentRunResult,
    OutputMode,
    StreamEvent,
    MultiAgentConfig
} from './types';

/**
 * Agent管理器
 * 提供agent实例的创建、管理和生命周期控制
 */
export class AgentManager extends EventEmitter {
    private agents: Map<string, UnifiedAgent> = new Map();
    private defaultConfig: AgentConfig;

    constructor(defaultConfig: AgentConfig) {
        super();
        this.defaultConfig = defaultConfig;
    }

    /**
     * 创建单一Agent
     */
    public createSingleAgent(
        name: string, 
        config?: Partial<AgentConfig>,
        tools: any[] = []
    ): UnifiedAgent {
        const finalConfig = { ...this.defaultConfig, ...config };
        const baseAgent = AgentFactory.createReactAgent(finalConfig, tools);
        const unifiedAgent = new UnifiedAgent(baseAgent);

        // 转发事件
        this.forwardEvents(unifiedAgent, name);
        
        this.agents.set(name, unifiedAgent);
        return unifiedAgent;
    }

    /**
     * 创建Multi-Agent系统
     */
    public createMultiAgent(name: string, config: MultiAgentConfig): UnifiedAgent {
        const multiAgent = AgentFactory.createMultiAgent(config);
        const unifiedAgent = new UnifiedAgent(multiAgent);

        // 转发事件
        this.forwardEvents(unifiedAgent, name);
        
        this.agents.set(name, unifiedAgent);
        return unifiedAgent;
    }

    /**
     * 获取Agent实例
     */
    public getAgent(name: string): UnifiedAgent | undefined {
        return this.agents.get(name);
    }

    /**
     * 删除Agent实例
     */
    public removeAgent(name: string): boolean {
        const agent = this.agents.get(name);
        if (agent) {
            agent.removeAllListeners();
            this.agents.delete(name);
            return true;
        }
        return false;
    }

    /**
     * 获取所有Agent名称
     */
    public getAgentNames(): string[] {
        return Array.from(this.agents.keys());
    }

    /**
     * 清理所有Agent实例
     */
    public cleanup(): void {
        this.agents.forEach((agent, name) => {
            agent.removeAllListeners();
        });
        this.agents.clear();
    }

    /**
     * 运行指定的Agent
     */
    public async runAgent(
        agentName: string,
        messages: BaseMessage[] | Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
        options?: AgentRunOptions
    ): Promise<AgentRunResult> {
        const agent = this.getAgent(agentName);
        if (!agent) {
            throw new Error(`Agent "${agentName}" not found`);
        }

        return await agent.run(messages, options);
    }

    /**
     * 批量运行多个Agent
     */
    public async runMultipleAgents(
        requests: Array<{
            agentName: string;
            messages: BaseMessage[] | Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
            options?: AgentRunOptions;
        }>
    ): Promise<Array<{ agentName: string; result: AgentRunResult; error?: string }>> {
        const results = await Promise.allSettled(
            requests.map(async (req) => {
                const result = await this.runAgent(req.agentName, req.messages, req.options);
                return { agentName: req.agentName, result };
            })
        );

        return results.map((result, index) => {
            if (result.status === 'fulfilled') {
                return result.value;
            } else {
                return {
                    agentName: requests[index].agentName,
                    result: {
                        messages: [],
                        toolCalls: [],
                        success: false,
                        error: result.reason?.message || 'Unknown error'
                    },
                    error: result.reason?.message || 'Unknown error'
                };
            }
        });
    }

    /**
     * 转发Agent事件
     */
    private forwardEvents(agent: UnifiedAgent, agentName: string): void {
        agent.on('stream', (event: StreamEvent) => {
            this.emit('agent_stream', { agentName, event });
        });

        agent.on('error', (event: StreamEvent) => {
            this.emit('agent_error', { agentName, event });
        });
    }

    /**
     * 创建预配置的Agent实例
     */
    public static createPreconfiguredManager(
        defaultModelName: string = 'gpt-4',
        defaultApiKey: string,
        defaultBaseUrl?: string
    ): AgentManager {
        const defaultConfig = AgentFactory.createSimpleConfig(
            defaultModelName,
            defaultApiKey,
            defaultBaseUrl
        );

        return new AgentManager(defaultConfig);
    }

    /**
     * 健康检查
     */
    public async healthCheck(): Promise<{
        totalAgents: number;
        agentNames: string[];
        healthy: boolean;
        errors: string[];
    }> {
        const errors: string[] = [];
        const agentNames = this.getAgentNames();

        // 这里可以添加更详细的健康检查逻辑
        // 比如测试每个agent是否能正常响应简单请求

        return {
            totalAgents: agentNames.length,
            agentNames,
            healthy: errors.length === 0,
            errors
        };
    }
}