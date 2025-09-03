import { ChatOpenAI } from '@langchain/openai';
import { BaseMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
// import { Tool } from '@langchain/core/tools';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { EventEmitter } from 'events';

import {
    AgentConfig,
    AgentState,
    AgentRunOptions,
    AgentRunResult,
    OutputMode,
    StreamEvent,
    ToolCallResult
} from './types';

/**
 * 基础Agent类
 * 提供ReAct模式的agent功能，支持工具调用和流式输出
 */
export class BaseAgent extends EventEmitter {
    private model!: ChatOpenAI;
    private tools: any[];
    private agent!: any;
    private config: AgentConfig;

    constructor(config: AgentConfig, tools: any[] = []) {
        super();
        this.config = config;
        this.tools = tools;
        this.initializeModel();
        this.initializeAgent();
    }

    /**
     * 初始化语言模型
     */
    private initializeModel(): void {
        this.model = new ChatOpenAI({
            modelName: this.config.modelName,
            openAIApiKey: this.config.apiKey,
            configuration: {
                baseURL: this.config.baseUrl,
            },
            temperature: this.config.temperature ?? 0.7,
            maxTokens: this.config.maxTokens,
            streaming: true,
        });
    }

    /**
     * 初始化Agent
     */
    private initializeAgent(): void {
        this.agent = createReactAgent({
            llm: this.model,
            tools: this.tools,
        });
    }

    /**
     * 添加工具
     */
    public addTool(tool: any): void {
        this.tools.push(tool);
        this.initializeAgent(); // 重新初始化agent
    }

    /**
     * 添加多个工具
     */
    public addTools(tools: any[]): void {
        this.tools.push(...tools);
        this.initializeAgent(); // 重新初始化agent
    }

    /**
     * 运行Agent
     */
    public async run(
        messages: BaseMessage[],
        options: AgentRunOptions = { outputMode: OutputMode.FINAL_ONLY }
    ): Promise<AgentRunResult> {
        const startTime = Date.now();
        const toolCalls: ToolCallResult[] = [];
        let finalMessage: BaseMessage | undefined;
        let success = false;
        let error: string | undefined;

        try {
            const state: AgentState = {
                messages: messages,
                metadata: {}
            };

            if (options.outputMode === OutputMode.STREAMING) {
                return await this.runWithStreaming(state, options, toolCalls);
            } else {
                return await this.runFinalOnly(state, options, toolCalls);
            }
        } catch (err) {
            error = err instanceof Error ? err.message : String(err);
            this.emit('error', { type: 'error', data: { error } } as StreamEvent);
            
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
     * 流式运行模式
     */
    private async runWithStreaming(
        state: AgentState,
        options: AgentRunOptions,
        toolCalls: ToolCallResult[]
    ): Promise<AgentRunResult> {
        const startTime = Date.now();
        let finalMessage: BaseMessage | undefined;
        const allMessages: BaseMessage[] = [...state.messages];

        try {
            const stream = await this.agent.stream(state, {
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

                            // 处理工具调用
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

                            // 处理消息内容
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
                        
                        // 处理工具消息
                        if (message._getType() === 'tool') {
                            const toolResult: ToolCallResult = {
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
     * 非流式运行模式
     */
    private async runFinalOnly(
        state: AgentState,
        options: AgentRunOptions,
        toolCalls: ToolCallResult[]
    ): Promise<AgentRunResult> {
        const startTime = Date.now();

        try {
            const result = await this.agent.invoke(state, {
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
     * 获取工具列表
     */
    public getTools(): any[] {
        return [...this.tools];
    }

    /**
     * 获取配置
     */
    public getConfig(): AgentConfig {
        return { ...this.config };
    }

    /**
     * 更新配置
     */
    public updateConfig(newConfig: Partial<AgentConfig>): void {
        this.config = { ...this.config, ...newConfig };
        this.initializeModel();
        this.initializeAgent();
    }
}