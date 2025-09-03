import { BaseMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import { ChatOpenAI } from '@langchain/openai';
import { StateGraph, START, END } from '@langchain/langgraph';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { EventEmitter } from 'events';
import { z } from 'zod';

import {
    AgentConfig,
    AgentState,
    AgentRunOptions,
    AgentRunResult,
    OutputMode,
    StreamEvent,
    MultiAgentConfig
} from './types';

/**
 * Handoff工具创建函数
 */
function createHandoffTool(targetAgent: string, description?: string): any {
    const toolDescription = description || `将任务转移给${targetAgent}代理`;
    
    return tool(
        async (input: { reason?: string }) => {
            return `成功转移到${targetAgent}代理。原因：${input.reason || '未指定'}`;
        },
        {
            name: `handoff_to_${targetAgent}`,
            description: toolDescription,
            schema: z.object({
                reason: z.string().optional().describe('转移的原因')
            })
        }
    );
}

/**
 * Multi-Agent系统类
 * 支持多个agent之间的handoff切换
 */
export class MultiAgent extends EventEmitter {
    private agents: Map<string, any> = new Map();
    private supervisorAgent!: any;
    private config: MultiAgentConfig;
    private graph!: any;

    constructor(config: MultiAgentConfig) {
        super();
        this.config = config;
        this.initializeAgents();
        this.initializeSupervisor();
        this.buildGraph();
    }

    /**
     * 初始化各个子agent
     */
    private initializeAgents(): void {
        for (const [agentName, agentConfig] of Object.entries(this.config.agents)) {
            const model = new ChatOpenAI({
                modelName: agentConfig.modelName,
                openAIApiKey: agentConfig.apiKey,
                configuration: {
                    baseURL: agentConfig.baseUrl,
                },
                temperature: agentConfig.temperature ?? 0.7,
                maxTokens: agentConfig.maxTokens,
                streaming: true,
            });

            // 为每个agent添加handoff工具
            const handoffTools = Object.keys(this.config.agents)
                .filter(name => name !== agentName)
                .map(targetAgent => createHandoffTool(targetAgent, 
                    `将任务转移给${this.config.agents[targetAgent].description}`));

            const allTools = [...agentConfig.tools, ...handoffTools];

            const agent = createReactAgent({
                llm: model,
                tools: allTools,
                messageModifier: agentConfig.prompt || `你是${agentConfig.description}。`
            });

            this.agents.set(agentName, agent);
        }
    }

    /**
     * 初始化监督者agent
     */
    private initializeSupervisor(): void {
        const supervisorConfig = this.config.supervisorConfig || this.config.agents[this.config.defaultAgent];
        
        const model = new ChatOpenAI({
            modelName: supervisorConfig.modelName,
            openAIApiKey: supervisorConfig.apiKey,
            configuration: {
                baseURL: supervisorConfig.baseUrl,
            },
            temperature: supervisorConfig.temperature ?? 0.7,
            maxTokens: supervisorConfig.maxTokens,
        });

        // 创建所有handoff工具
        const handoffTools = Object.entries(this.config.agents).map(([agentName, agentConfig]) =>
            createHandoffTool(agentName, `将任务分配给${agentConfig.description}`)
        );

        const supervisorPrompt = this.config.supervisorConfig?.prompt || 
            `你是一个任务分配监督者，负责将任务分配给合适的专业代理。

可用的代理：
${Object.entries(this.config.agents).map(([name, config]) => 
    `- ${name}: ${config.description}`
).join('\n')}

请根据用户的请求选择最合适的代理来处理任务。
一次只能选择一个代理，不要并行调用多个代理。
如果任务复杂，可以在代理之间进行切换。`;

        this.supervisorAgent = createReactAgent({
            llm: model,
            tools: handoffTools,
            messageModifier: supervisorPrompt
        });
    }

    /**
     * 构建状态图
     */
    private buildGraph(): void {
        // 简化版本，直接使用supervisor agent作为主要处理器
        // 在真实的LangGraph实现中，这里会有更复杂的状态图逻辑
        this.graph = this.supervisorAgent;
    }

    /**
     * 路由决策函数
     */
    private routeToAgent(state: AgentState): string {
        const lastMessage = state.messages[state.messages.length - 1];
        
        if (lastMessage._getType() === 'ai' && (lastMessage as any).tool_calls) {
            for (const toolCall of (lastMessage as any).tool_calls) {
                if (toolCall.name.startsWith('handoff_to_')) {
                    const targetAgent = toolCall.name.replace('handoff_to_', '');
                    if (this.config.agents[targetAgent]) {
                        this.emit('stream', {
                            type: 'agent_switch',
                            data: { 
                                fromAgent: state.currentAgent || 'supervisor', 
                                toAgent: targetAgent 
                            }
                        } as StreamEvent);
                        return targetAgent;
                    }
                }
            }
        }

        return END;
    }

    /**
     * 运行Multi-Agent系统
     */
    public async run(
        messages: BaseMessage[],
        options: AgentRunOptions = { outputMode: OutputMode.FINAL_ONLY }
    ): Promise<AgentRunResult> {
        const startTime = Date.now();
        const toolCalls: any[] = [];

        try {
            const initialState: AgentState = {
                messages: messages,
                currentAgent: 'supervisor',
                metadata: {}
            };

            if (options.outputMode === OutputMode.STREAMING) {
                return await this.runWithStreaming(initialState, options, toolCalls);
            } else {
                return await this.runFinalOnly(initialState, options, toolCalls);
            }

        } catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            
            return {
                messages: messages,
                toolCalls,
                success: false,
                error,
                metadata: { duration: Date.now() - startTime }
            };
        }
    }

    /**
     * 流式运行
     */
    private async runWithStreaming(
        state: AgentState,
        options: AgentRunOptions,
        toolCalls: any[]
    ): Promise<AgentRunResult> {
        const startTime = Date.now();
        const allMessages: BaseMessage[] = [...state.messages];
        let finalMessage: BaseMessage | undefined;

        try {
            const stream = await this.graph.stream(state, {
                streamMode: 'values',
                ...(options.maxIterations && { recursionLimit: options.maxIterations })
            });

            for await (const chunk of stream) {
                if (chunk.messages && chunk.messages.length > 0) {
                    const newMessages = chunk.messages.slice(allMessages.length);
                    
                    for (const message of newMessages) {
                        allMessages.push(message);
                        
                        if (message._getType() === 'ai') {
                            const messageId = this.generateMessageId();
                            
                            this.emit('stream', {
                                type: 'message_start',
                                data: { messageId }
                            } as StreamEvent);

                            if (message.tool_calls && message.tool_calls.length > 0) {
                                for (const toolCall of message.tool_calls) {
                                    this.emit('stream', {
                                        type: 'tool_call_start',
                                        data: {
                                            toolName: toolCall.name,
                                            input: toolCall.args
                                        }
                                    } as StreamEvent);
                                }
                            }

                            if (message.content) {
                                this.emit('stream', {
                                    type: 'message_chunk',
                                    data: {
                                        content: message.content,
                                        messageId
                                    }
                                } as StreamEvent);
                            }

                            this.emit('stream', {
                                type: 'message_end',
                                data: { messageId }
                            } as StreamEvent);

                            finalMessage = message;
                        }
                        
                        if (message._getType() === 'tool') {
                            const toolResult: any = {
                                toolName: message.name || 'unknown',
                                input: message.additional_kwargs,
                                output: message.content,
                                success: true
                            };
                            
                            toolCalls.push(toolResult);
                            
                            this.emit('stream', {
                                type: 'tool_call_end',
                                data: toolResult
                            } as StreamEvent);
                        }
                    }
                }
            }

            const result: AgentRunResult = {
                finalMessage,
                messages: allMessages,
                toolCalls,
                success: true,
                metadata: { duration: Date.now() - startTime }
            };

            this.emit('stream', {
                type: 'final_result',
                data: { result }
            } as StreamEvent);

            return result;

        } catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            
            return {
                messages: allMessages,
                toolCalls,
                success: false,
                error,
                metadata: { duration: Date.now() - startTime }
            };
        }
    }

    /**
     * 非流式运行
     */
    private async runFinalOnly(
        state: AgentState,
        options: AgentRunOptions,
        toolCalls: any[]
    ): Promise<AgentRunResult> {
        const startTime = Date.now();

        try {
            const result = await this.graph.invoke(state, {
                ...(options.maxIterations && { recursionLimit: options.maxIterations })
            });

            const finalMessage = result.messages[result.messages.length - 1];
            
            // 提取工具调用信息
            for (const message of result.messages) {
                if (message._getType() === 'tool') {
                    toolCalls.push({
                        toolName: message.name || 'unknown',
                        input: message.additional_kwargs,
                        output: message.content,
                        success: true
                    });
                }
            }

            return {
                finalMessage,
                messages: result.messages,
                toolCalls,
                success: true,
                metadata: { duration: Date.now() - startTime }
            };

        } catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            
            return {
                messages: state.messages,
                toolCalls,
                success: false,
                error,
                metadata: { duration: Date.now() - startTime }
            };
        }
    }

    /**
     * 生成消息ID
     */
    private generateMessageId(): string {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * 添加新的agent
     */
    public addAgent(name: string, config: AgentConfig & { 
        description: string; 
        tools: any[];
        prompt?: string;
    }): void {
        this.config.agents[name] = { ...config, name };
        this.initializeAgents();
        this.initializeSupervisor();
        this.buildGraph();
    }

    /**
     * 移除agent
     */
    public removeAgent(name: string): void {
        if (name === this.config.defaultAgent) {
            throw new Error('Cannot remove default agent');
        }
        
        delete this.config.agents[name];
        this.agents.delete(name);
        this.initializeAgents();
        this.initializeSupervisor();
        this.buildGraph();
    }

    /**
     * 获取所有agent名称
     */
    public getAgentNames(): string[] {
        return Object.keys(this.config.agents);
    }

    /**
     * 获取agent配置
     */
    public getAgentConfig(name: string): (AgentConfig & { description: string; tools: any[]; prompt?: string }) | undefined {
        return this.config.agents[name];
    }
}