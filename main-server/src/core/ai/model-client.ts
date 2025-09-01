/**
 * @file model-client.ts
 * @description AI模型客户端，负责与各种AI模型提供商通信
 */

import OpenAI from 'openai';
import { ContentFilterError } from '../../types/ai-chat';
import { DataSource } from 'typeorm';
import { ModelProvider } from '../../dal/entities';
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

            // 获取数据库连接
            const AppDataSource = (global as any).AppDataSource as DataSource;
            if (!AppDataSource) {
                throw new Error('数据库连接未初始化');
            }

            const modelProviderRepo = AppDataSource.getRepository(ModelProvider);

            // 直接查询供应商信息
            let provider = await modelProviderRepo.findOne({
                where: { name: providerName }
            });

            // 如果找不到指定供应商，尝试使用默认的302.ai
            if (!provider) {
                provider = await modelProviderRepo.findOne({
                    where: { name: '302.ai' }
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
            logger.error(`获取模型配置失败: ${modelId}`, { error });
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