/**
 * @file model-client.ts
 * @description AI模型客户端，负责与各种AI模型提供商通信
 */

import OpenAI from 'openai';
import { ContentFilterError } from '../../types/ai-chat';
import { ModelProviderRepository } from 'dal/repositories/repositories';
import { ChatCompletionCreateParamsStreaming, ChatCompletionMessageParam } from 'openai/resources/index';
import { getToolManager } from '../../services/ai/tool-manager';

/**
 * 聊天完成流响应
 */
interface ChatCompletionStreamResponse {
    delta?: {
        content?: string | null;
        tool_calls?: Array<{
            function?: {
                name?: string;
                arguments?: string;
            };
        }>;
    };
    finish_reason?: string;
}

/**
 * 模型配置信息接口
 */
interface ModelConfigInfo {
    model_id: string;
    provider_name: string;
    api_key: string;
    base_url: string;
    model_name: string;
}

/**
 * AI模型客户端类
 */
export class ModelClient {
    private static clientCache: Map<string, OpenAI> = new Map();
    private static modelInfoCache: Map<string, ModelConfigInfo> = new Map();

    /**
     * 解析model_id格式："{供应商名称}/模型原名"
     */
    private static parseModelId(modelId: string): [string, string] {
        if (modelId.includes('/')) {
            const [providerName, modelName] = modelId.split('/', 2);
            return [providerName.trim(), modelName.trim()];
        } else {
            // 如果没有/，使用默认供应商302.ai
            return ['302.ai', modelId.trim()];
        }
    }

    /**
     * 获取模型信息（从数据库获取供应商配置）
     */
    private static async getModelInfo(modelId: string): Promise<ModelConfigInfo> {
        if (this.modelInfoCache.has(modelId)) {
            return this.modelInfoCache.get(modelId)!;
        }

        try {
            const [providerName, actualModelName] = this.parseModelId(modelId);

            // 直接查询供应商信息
            let provider = await ModelProviderRepository.findOne({
                where: { name: providerName },
            });

            // 如果找不到指定供应商，尝试使用默认的302.ai
            if (!provider) {
                provider = await ModelProviderRepository.findOne({
                    where: { name: '302.ai' },
                });
            }

            if (!provider) {
                throw new Error(`未找到供应商配置: ${providerName}`);
            }

            const modelInfo: ModelConfigInfo = {
                model_id: modelId,
                provider_name: provider.name,
                api_key: provider.apiKey,
                base_url: provider.baseUrl,
                model_name: actualModelName,
            };

            this.modelInfoCache.set(modelId, modelInfo);
            return modelInfo;
        } catch (error) {
            console.error(`获取模型配置失败: ${modelId}`, { error });
            throw error;
        }
    }

    /**
     * 获取OpenAI客户端实例
     */
    private static async getOpenAIClient(modelId: string): Promise<OpenAI> {
        if (this.clientCache.has(modelId)) {
            return this.clientCache.get(modelId)!;
        }

        const modelInfo = await this.getModelInfo(modelId);
        const client = new OpenAI({
            apiKey: modelInfo.api_key,
            baseURL: modelInfo.base_url,
        });

        this.clientCache.set(modelId, client);
        return client;
    }

    /**
     * 聊天完成流式调用（支持工具调用循环）
     */
    static async *chatCompletionStream(
        modelId: string,
        messages: Array<{ role: string; content: string }>,
        options: {
            temperature?: number;
            tools?: any[];
            maxToolIterations?: number;
        } = {},
    ): AsyncGenerator<ChatCompletionStreamResponse, void, unknown> {
        try {
            const client = await this.getOpenAIClient(modelId);
            const modelInfo = await this.getModelInfo(modelId);
            
            const { temperature = 0.7, tools, maxToolIterations = 10 } = options;
            
            // 复制消息列表以避免修改原始数据
            let currentMessages = [...messages];
            let iterationCount = 0;

            while (iterationCount < maxToolIterations) {
                const params: ChatCompletionCreateParamsStreaming = {
                    model: modelInfo.model_name,
                    messages: currentMessages as ChatCompletionMessageParam[],
                    temperature,
                    stream: true,
                };

                if (tools && tools.length > 0) {
                    params.tools = tools;
                    params.tool_choice = 'auto';
                }

                console.info(`调用模型 ${modelId} 进行流式聊天 (迭代 ${iterationCount + 1})`, {
                    modelName: modelInfo.model_name,
                    messageCount: currentMessages.length,
                });

                const stream = await client.chat.completions.create(params);
                
                // 收集流式响应
                const toolCallChunks: any[] = [];
                let currentContent = '';
                let hasToolCalls = false;

                for await (const chunk of stream) {
                    const choice = chunk.choices[0];
                    if (!choice) continue;

                    const delta = choice.delta;

                    // 处理文本内容
                    if (delta && delta.content) {
                        currentContent += delta.content;
                        // 流式输出文本内容
                        yield {
                            delta: choice.delta,
                            finish_reason: undefined,
                        };
                    }

                    // 处理工具调用
                    if (delta && delta.tool_calls) {
                        hasToolCalls = true;
                        toolCallChunks.push(...delta.tool_calls);
                        // 输出工具调用信息
                        yield {
                            delta: choice.delta,
                            finish_reason: undefined,
                        };
                    }

                    // 检查完成原因
                    if (choice.finish_reason) {
                        yield {
                            delta: choice.delta,
                            finish_reason: choice.finish_reason,
                        };
                        
                        if (choice.finish_reason === 'content_filter') {
                            throw new ContentFilterError();
                        }
                        
                        break;
                    }
                }

                // 如果没有工具调用或没有配置工具，结束循环
                if (!hasToolCalls || !tools || tools.length === 0) {
                    break;
                }

                // 组装工具调用
                const toolCalls = this.assembleToolCalls(toolCallChunks);
                
                // 添加助手消息到对话历史
                (currentMessages as any[]).push({
                    role: 'assistant',
                    content: currentContent || null,
                    tool_calls: toolCalls,
                });

                // 执行工具调用
                try {
                    const toolManager = getToolManager();
                    
                    for (const toolCall of toolCalls) {
                        const functionName = toolCall.function.name;
                        
                        try {
                            // 解析工具参数
                            const functionArgs = JSON.parse(toolCall.function.arguments);
                            
                            console.info(`执行工具调用: ${functionName}`, { args: functionArgs });
                            
                            // 执行工具
                            const functionResponse = await toolManager.executeTool(functionName, functionArgs);
                            
                            // 添加工具响应到消息历史
                            (currentMessages as any[]).push({
                                tool_call_id: toolCall.id,
                                role: 'tool',
                                name: functionName,
                                content: typeof functionResponse === 'string' ? functionResponse : JSON.stringify(functionResponse),
                            });
                            
                            console.info(`工具调用完成: ${functionName}`);
                            
                        } catch (error) {
                            console.error(`工具执行错误: ${functionName}`, { error });
                            // 添加错误响应
                            (currentMessages as any[]).push({
                                tool_call_id: toolCall.id,
                                role: 'tool',
                                name: functionName,
                                content: `Error: ${error instanceof Error ? error.message : String(error)}`,
                            });
                        }
                    }
                } catch (error) {
                    console.error('工具管理器未初始化或执行失败', { error });
                    // 如果工具管理器有问题，跳出循环
                    break;
                }

                // 重置内容累积器，继续下一轮对话
                currentContent = '';
                iterationCount++;
            }

        } catch (error) {
            if (error instanceof ContentFilterError) {
                throw error;
            }
            console.error(`模型 ${modelId} 调用失败`, {
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    /**
     * 组装工具调用块为完整的工具调用对象
     */
    private static assembleToolCalls(toolCallChunks: any[]): Array<{
        id: string;
        type: string;
        function: { name: string; arguments: string };
    }> {
        const toolCallsDict: Record<number, any> = {};
        
        for (const chunk of toolCallChunks) {
            const index = chunk.index;
            if (!toolCallsDict[index]) {
                toolCallsDict[index] = {
                    id: '',
                    type: 'function',
                    function: { name: '', arguments: '' }
                };
            }
            
            const tc = toolCallsDict[index];
            if (chunk.id) {
                tc.id += chunk.id;
            }
            if (chunk.function?.name) {
                tc.function.name += chunk.function.name;
            }
            if (chunk.function?.arguments) {
                tc.function.arguments += chunk.function.arguments;
            }
        }
        
        return Object.values(toolCallsDict);
    }
}
