/**
 * @file ai-message-service.ts
 * @description AI消息服务，负责处理AI回复生成逻辑
 */

import { ChatStreamChunk, ContentFilterError, ModelConfig } from '../../types/ai-chat';
import { StreamProcessor } from '../../core/ai/stream-processor';
import { MessageContext } from './context-service';
import { ChatPromptService } from './prompt-service';

/**
 * AI消息服务类
 */
export class AiMessageService {
    /**
     * 生成AI回复内容（支持多轮对话和模型切换）
     */
    static async* generateAiReply(
        messageId: string,
        options: {
            yieldInterval?: number;
            modelConfigs?: ModelConfig[];
        } = {}
    ): AsyncGenerator<ChatStreamChunk, void, unknown> {
        const { yieldInterval = 0.5 } = options;
        
        // 使用写死的模型配置（与ai-service保持一致）
        const modelConfigs = options.modelConfigs || [
            { id: '302.ai/gpt-4.1', name: '主模型' },
            // { id: 'Moonshot/kimi-k2-0711-preview', name: '备用模型' },
        ];

        try {
            // 获取系统提示词
            const prompt = await ChatPromptService.getPrompt({});
            
            // 创建消息上下文并初始化
            const messageContext = new MessageContext(messageId, () => prompt);
            await messageContext.initContextMessages();
            
            // 构建完整消息列表
            const messages = messageContext.build({});

            // 尝试每个模型
            for (let i = 0; i < modelConfigs.length; i++) {
                const modelConfig = modelConfigs[i];
                let accumulatedContent = '';
                
                try {
                    console.info(`尝试使用模型: ${modelConfig.name} (${modelConfig.id})`);

                    const stream = StreamProcessor.streamWithModel(
                        messages,
                        modelConfig.id,
                        { yieldInterval, enableTools: true }
                    );

                    for await (const chunk of stream) {
                        // 直接透传 StreamProcessor 的输出，不再重复处理时间间隔
                        if (chunk.content) {
                            accumulatedContent = chunk.content;
                        }
                        yield chunk;
                    }

                    // 成功完成，直接返回
                    return;

                } catch (error) {
                    if (error instanceof ContentFilterError) {
                        if (i < modelConfigs.length - 1) {
                            console.warn(`${modelConfig.name}内容过滤，切换模型: ${error.message}`);
                            await AiMessageService.handlePartialResponse(messages, { content: accumulatedContent });
                            continue;
                        } else {
                            console.error('所有模型都因内容过滤失败');
                            yield { content: '赤尾有点不想讨论这个话题呢~' };
                            return;
                        }
                    } else {
                        if (i < modelConfigs.length - 1) {
                            console.warn(`${modelConfig.name}失败，切换模型: ${error instanceof Error ? error.message : String(error)}`);
                            await AiMessageService.handlePartialResponse(messages, { content: accumulatedContent });
                            continue;
                        } else {
                            console.error('所有模型都失败');
                            throw error;
                        }
                    }
                }
            }

        } catch (error) {
            console.error('生成AI回复时出错', { error, messageId });
            yield { content: '赤尾好像遇到了一些问题呢QAQ' };
        }
    }



    /**
     * 处理部分响应
     */
    private static async handlePartialResponse(
        messages: Array<{ role: string; content: string; partial?: boolean }>,
        accumulatedContent: ChatStreamChunk
    ): Promise<void> {
        return StreamProcessor.handlePartialResponse(messages, accumulatedContent);
    }
}
