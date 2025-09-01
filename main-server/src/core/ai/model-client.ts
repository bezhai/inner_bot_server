/**
 * @file model-client.ts
 * @description AI模型客户端，负责与各种AI模型提供商通信
 */

import OpenAI from 'openai';
import { ContentFilterError } from '../../types/ai-chat';
import { ModelConfigService, ModelConfigInfo } from '../../services/ai/model-config-service';
import logger from '../../services/logger';



/**
 * 聊天完成流响应
 */
interface ChatCompletionStreamResponse {
    delta?: {
        content?: string;
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
 * AI模型客户端类
 */
export class ModelClient {
    private static clientCache: Map<string, OpenAI> = new Map();
    private static modelInfoCache: Map<string, ModelConfigInfo> = new Map();

    /**
     * 获取模型信息（从数据库获取）
     */
    private static async getModelInfo(modelId: string): Promise<ModelConfigInfo> {
        if (this.modelInfoCache.has(modelId)) {
            return this.modelInfoCache.get(modelId)!;
        }

        const modelInfo = await ModelConfigService.getModelAndProviderInfo(modelId);
        if (!modelInfo) {
            throw new Error(`Model ${modelId} not found in database`);
        }

        this.modelInfoCache.set(modelId, modelInfo);
        return modelInfo;
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
     * 聊天完成流式调用
     */
    static async* chatCompletionStream(
        modelId: string,
        messages: Array<{ role: string; content: string }>,
        options: {
            temperature?: number;
            tools?: any[];
            maxToolIterations?: number;
        } = {}
    ): AsyncGenerator<ChatCompletionStreamResponse, void, unknown> {
        try {
            const client = await this.getOpenAIClient(modelId);
            const modelInfo = await this.getModelInfo(modelId);

            const params: any = {
                model: modelInfo.model_name,
                messages,
                temperature: options.temperature || 0.7,
                stream: true,
            };

            if (options.tools && options.tools.length > 0) {
                params.tools = options.tools;
                params.tool_choice = 'auto';
            }

            logger.info(`调用模型 ${modelId} 进行流式聊天`, { 
                modelName: modelInfo.model_name,
                messageCount: messages.length 
            });

            const stream = await client.chat.completions.create(params);

            for await (const chunk of stream as any) {
                const choice = chunk.choices[0];
                if (!choice) continue;

                yield {
                    delta: choice.delta,
                    finish_reason: choice.finish_reason || undefined,
                };

                // 检查完成原因
                if (choice.finish_reason) {
                    if (choice.finish_reason === 'content_filter') {
                        throw new ContentFilterError();
                    }
                    if (choice.finish_reason !== 'tool_calls') {
                        break;
                    }
                }
            }
        } catch (error) {
            if (error instanceof ContentFilterError) {
                throw error;
            }
            logger.error(`模型 ${modelId} 调用失败`, { error: error instanceof Error ? error.message : String(error) });
            throw error;
        }
    }
}