/**
 * Agent服务类
 * 提供高级封装，便于在项目中集成和使用
 */

import { BaseMessage, HumanMessage } from '@langchain/core/messages';
import { EventEmitter } from 'events';

import {
    AgentFactory,
    UnifiedAgent,
    AgentManager,
    OutputMode,
    AgentConfig,
    AgentRunOptions,
    AgentRunResult,
    StreamEvent,
    MultiAgentConfig
} from './index';
import { availableTools, getAllTools } from './tools';

/**
 * Agent服务配置
 */
export interface AgentServiceConfig {
    /** 默认模型配置 */
    defaultModel: {
        modelName: string;
        apiKey: string;
        baseUrl?: string;
        temperature?: number;
    };
    /** 是否启用详细日志 */
    enableVerboseLogging?: boolean;
    /** 默认超时时间（毫秒） */
    defaultTimeout?: number;
}

/**
 * Agent服务类
 * 提供企业级的Agent管理和使用功能
 */
export class AgentService extends EventEmitter {
    private manager: AgentManager;
    private config: AgentServiceConfig;
    private activeAgents: Map<string, UnifiedAgent> = new Map();

    constructor(config: AgentServiceConfig) {
        super();
        this.config = config;
        
        const defaultAgentConfig = AgentFactory.createSimpleConfig(
            config.defaultModel.modelName,
            config.defaultModel.apiKey,
            config.defaultModel.baseUrl,
            {
                temperature: config.defaultModel.temperature
            }
        );

        this.manager = new AgentManager(defaultAgentConfig);
        
        if (config.enableVerboseLogging) {
            this.setupVerboseLogging();
        }
    }

    /**
     * 设置详细日志
     */
    private setupVerboseLogging(): void {
        this.on('agent_created', (data) => {
            console.log(`🤖 Agent创建: ${data.name}, 类型: ${data.type}`);
        });

        this.on('agent_run_start', (data) => {
            console.log(`🚀 Agent开始运行: ${data.agentName}`);
        });

        this.on('agent_run_complete', (data) => {
            console.log(`✅ Agent运行完成: ${data.agentName}, 耗时: ${data.duration}ms`);
        });
    }

    /**
     * 创建通用助手Agent
     */
    public createGeneralAssistant(name: string = 'general_assistant'): UnifiedAgent {
        const agent = this.manager.createSingleAgent(name, {}, getAllTools());
        this.activeAgents.set(name, agent);
        
        this.emit('agent_created', { name, type: 'single', toolsCount: getAllTools().length });
        return agent;
    }

    /**
     * 创建专业领域Agent
     */
    public createSpecializedAgent(
        name: string,
        specialization: 'math' | 'text' | 'time' | 'search',
        customConfig?: Partial<AgentConfig>
    ): UnifiedAgent {
        const toolMap = {
            math: [availableTools.calculator],
            text: [availableTools.textProcessor],
            time: [availableTools.getCurrentTime],
            search: [availableTools.search]
        };

        const agent = this.manager.createSingleAgent(
            name,
            customConfig || {},
            toolMap[specialization]
        );
        
        this.activeAgents.set(name, agent);
        
        this.emit('agent_created', { 
            name, 
            type: 'specialized', 
            specialization,
            toolsCount: toolMap[specialization].length 
        });
        
        return agent;
    }

    /**
     * 创建客服系统Agent
     */
    public createCustomerServiceAgent(name: string = 'customer_service'): UnifiedAgent {
        const multiAgentConfig: MultiAgentConfig = {
            agents: {
                general_support: {
                    name: 'general_support',
                    description: '通用客服支持',
                    modelName: this.config.defaultModel.modelName,
                    apiKey: this.config.defaultModel.apiKey,
                    baseUrl: this.config.defaultModel.baseUrl,
                    tools: [availableTools.search, availableTools.getCurrentTime],
                    prompt: '你是通用客服，负责处理一般性的客户咨询和问题解答。'
                },
                technical_support: {
                    name: 'technical_support',
                    description: '技术支持专家',
                    modelName: this.config.defaultModel.modelName,
                    apiKey: this.config.defaultModel.apiKey,
                    baseUrl: this.config.defaultModel.baseUrl,
                    tools: [availableTools.textProcessor, availableTools.calculator],
                    prompt: '你是技术支持专家，专门处理技术问题、故障排查和解决方案提供。'
                }
            },
            defaultAgent: 'general_support'
        };

        const multiAgent = AgentFactory.createMultiAgent(multiAgentConfig);
        const unifiedAgent = new UnifiedAgent(multiAgent);
        
        this.activeAgents.set(name, unifiedAgent);
        
        this.emit('agent_created', { 
            name, 
            type: 'customer_service',
            agentsCount: Object.keys(multiAgentConfig.agents).length 
        });
        
        return unifiedAgent;
    }

    /**
     * 智能对话处理
     */
    public async processConversation(
        agentName: string,
        userMessage: string,
        conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [],
        options?: {
            streaming?: boolean;
            maxIterations?: number;
            includeContext?: boolean;
        }
    ): Promise<AgentRunResult> {
        const agent = this.activeAgents.get(agentName);
        if (!agent) {
            throw new Error(`Agent "${agentName}" 不存在。请先创建该Agent。`);
        }

        const startTime = performance.now();
        this.emit('agent_run_start', { agentName });

        try {
            // 构建消息历史
            const messages: BaseMessage[] = [];
            
            if (options?.includeContext && conversationHistory.length > 0) {
                for (const msg of conversationHistory) {
                    messages.push(new HumanMessage(msg.content));
                }
            }
            
            messages.push(new HumanMessage(userMessage));

            const result = await agent.run(messages, {
                outputMode: options?.streaming ? OutputMode.STREAMING : OutputMode.FINAL_ONLY,
                maxIterations: options?.maxIterations || 10,
                timeout: this.config.defaultTimeout
            });

            const duration = performance.now() - startTime;
            this.emit('agent_run_complete', { agentName, duration, success: result.success });

            return result;
        } catch (error) {
            const duration = performance.now() - startTime;
            this.emit('agent_run_complete', { 
                agentName, 
                duration, 
                success: false, 
                error: error instanceof Error ? error.message : String(error) 
            });
            throw error;
        }
    }

    /**
     * 批量处理对话
     */
    public async processBatchConversations(
        requests: Array<{
            agentName: string;
            userMessage: string;
            conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
            options?: any;
        }>
    ): Promise<Array<{ request: any; result?: AgentRunResult; error?: string }>> {
        const results = [];

        for (const request of requests) {
            try {
                const result = await this.processConversation(
                    request.agentName,
                    request.userMessage,
                    request.conversationHistory,
                    request.options
                );
                results.push({ request, result });
            } catch (error) {
                results.push({
                    request,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }

        return results;
    }

    /**
     * 获取Agent状态
     */
    public getAgentStatus(agentName: string): {
        exists: boolean;
        type?: 'single' | 'multi';
        toolsCount?: number;
        config?: any;
    } {
        const agent = this.activeAgents.get(agentName);
        
        if (!agent) {
            return { exists: false };
        }

        return {
            exists: true,
            type: agent.getType(),
            toolsCount: agent.getType() === 'single' ? (agent.getAgent() as any).getTools?.()?.length : undefined,
            config: agent.getType() === 'single' ? (agent.getAgent() as any).getConfig?.() : undefined
        };
    }

    /**
     * 获取所有Agent状态
     */
    public getAllAgentStatus(): Record<string, any> {
        const status: Record<string, any> = {};
        
        for (const [name] of this.activeAgents) {
            status[name] = this.getAgentStatus(name);
        }

        return status;
    }

    /**
     * 删除Agent
     */
    public removeAgent(agentName: string): boolean {
        const agent = this.activeAgents.get(agentName);
        if (agent) {
            agent.removeAllListeners();
            this.activeAgents.delete(agentName);
            this.manager.removeAgent(agentName);
            
            this.emit('agent_removed', { agentName });
            return true;
        }
        return false;
    }

    /**
     * 清理所有资源
     */
    public cleanup(): void {
        for (const [name, agent] of this.activeAgents) {
            agent.removeAllListeners();
        }
        this.activeAgents.clear();
        this.manager.cleanup();
        
        this.emit('service_cleanup');
    }

    /**
     * 服务健康检查
     */
    public async healthCheck(): Promise<{
        healthy: boolean;
        activeAgents: number;
        agentNames: string[];
        uptime: number;
        memory: NodeJS.MemoryUsage;
    }> {
        const managerHealth = await this.manager.healthCheck();
        
        return {
            healthy: managerHealth.healthy,
            activeAgents: this.activeAgents.size,
            agentNames: Array.from(this.activeAgents.keys()),
            uptime: process.uptime(),
            memory: process.memoryUsage()
        };
    }

    /**
     * 获取服务统计信息
     */
    public getServiceStats(): {
        totalAgentsCreated: number;
        activeAgents: number;
        availableTools: number;
        serviceConfig: AgentServiceConfig;
    } {
        return {
            totalAgentsCreated: this.activeAgents.size,
            activeAgents: this.activeAgents.size,
            availableTools: getAllTools().length,
            serviceConfig: this.config
        };
    }
}

/**
 * 创建预配置的Agent服务实例
 */
export function createAgentService(
    modelName: string = 'gpt-3.5-turbo',
    apiKey?: string,
    baseUrl?: string,
    options?: {
        temperature?: number;
        enableVerboseLogging?: boolean;
        defaultTimeout?: number;
    }
): AgentService {
    const config: AgentServiceConfig = {
        defaultModel: {
            modelName,
            apiKey: apiKey || process.env.OPENAI_API_KEY || 'demo-key',
            baseUrl: baseUrl || process.env.OPENAI_BASE_URL,
            temperature: options?.temperature ?? 0.7
        },
        enableVerboseLogging: options?.enableVerboseLogging ?? false,
        defaultTimeout: options?.defaultTimeout ?? 30000
    };

    return new AgentService(config);
}