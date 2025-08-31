/**
 * @file model-client.ts
 * @description AI模型客户端，负责与各种AI模型提供商通信
 */

import OpenAI from 'openai';
import { ContentFilterError } from '../../types/ai-chat';
import logger from '../../services/logger';

/**
 * 模型信息接口
 */
interface ModelInfo {
    model_id: string;
    provider_name: string;
    api_key: string;
    base_url: string;
    model_name: string;
}

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
    private static modelInfoCache: Map<string, ModelInfo> = new Map();

    /**
     * 获取模型信息 (简化版，实际应该从数据库获取)
     */
    private static async getModelInfo(modelId: string): Promise<ModelInfo> {
        if (this.modelInfoCache.has(modelId)) {
            return this.modelInfoCache.get(modelId)!;
        }

        // TODO: 从数据库获取模型信息，这里先用硬编码
        const modelConfigs: Record<string, ModelInfo> = {
            '302.ai/gpt-4.1': {
                model_id: '302.ai/gpt-4.1',
                provider_name: '302.ai',
                api_key: process.env.AI_302_API_KEY || '',
                base_url: 'https://api.302.ai/v1',
                model_name: 'gpt-4.1'
            },
            'Moonshot/kimi-k2-0711-preview': {
                model_id: 'Moonshot/kimi-k2-0711-preview',
                provider_name: 'Moonshot',
                api_key: process.env.AI_MOONSHOT_API_KEY || '',
                base_url: 'https://api.moonshot.cn/v1',
                model_name: 'kimi-k2-0711-preview'
            }
        };

        const modelInfo = modelConfigs[modelId];
        if (!modelInfo) {
            throw new Error(`Model ${modelId} not found`);
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