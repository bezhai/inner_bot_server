/**
 * @file ai-message-service.ts
 * @description AI消息服务，负责处理AI回复生成逻辑
 */

import { ChatStreamChunk, ContentFilterError, ModelConfig, PromptGeneratorParam } from '../../types/ai-chat';
import { StreamProcessor } from '../../core/ai/stream-processor';
import { MessageContext } from './context-service';
import { ChatPromptService } from './prompt-service';
import { ModelConfigService } from './model-config-service';
import logger from '../logger';

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
        
        // 获取模型配置（从数据库或使用默认配置）
        const modelConfigs = options.modelConfigs || await ModelConfigService.getDefaultModelConfigs();

        try {
            // 获取系统提示词
            const prompt = await ChatPromptService.getPrompt({});
            
            // 创建消息上下文并初始化
            const messageContext = new MessageContext(messageId, (param) => prompt);
            await messageContext.initContextMessages();
            
            // 构建完整消息列表
            const messages = messageContext.build({});

            let accumulated: ChatStreamChunk = { content: '', reason_content: '' };
            let lastYieldTime = Date.now();

            // 尝试每个模型
            for (let i = 0; i < modelConfigs.length; i++) {
                const modelConfig = modelConfigs[i];
                
                try {
                    logger.info(`尝试使用模型: ${modelConfig.name} (${modelConfig.id})`);

                    const stream = StreamProcessor.streamWithModel(
                        messages,
                        modelConfig.id,
                        { yieldInterval, enableTools: true }
                    );

                    for await (const chunk of stream) {
                        // 累积内容
                        if (chunk.content) {
                            accumulated.content = (accumulated.content || '') + chunk.content;
                        }
                        if (chunk.reason_content) {
                            accumulated.reason_content = (accumulated.reason_content || '') + chunk.reason_content;
                        }
                        if (chunk.tool_call_feedback) {
                            accumulated.tool_call_feedback = chunk.tool_call_feedback;
                        }

                        // 检查是否到了输出间隔时间
                        const currentTime = Date.now();
                        if (currentTime - lastYieldTime >= yieldInterval * 1000) {
                            if (accumulated.content || accumulated.tool_call_feedback) {
                                yield {
                                    content: accumulated.content,
                                    reason_content: accumulated.reason_content,
                                    tool_call_feedback: accumulated.tool_call_feedback,
                                };
                                lastYieldTime = currentTime;
                            }
                        }
                    }

                    // 成功完成，输出最终内容并返回
                    if (accumulated.content) {
                        yield {
                            content: accumulated.content,
                            reason_content: accumulated.reason_content,
                            tool_call_feedback: accumulated.tool_call_feedback,
                        };
                    }
                    return;

                } catch (error) {
                    if (error instanceof ContentFilterError) {
                        if (i < modelConfigs.length - 1) {
                            logger.warn(`${modelConfig.name}内容过滤，切换模型: ${error.message}`);
                            await AiMessageService.handlePartialResponse(messages, accumulated);
                            lastYieldTime = Date.now();
                            continue;
                        } else {
                            logger.error('所有模型都因内容过滤失败');
                            yield { content: '赤尾有点不想讨论这个话题呢~' };
                            return;
                        }
                    } else {
                        if (i < modelConfigs.length - 1) {
                            logger.warn(`${modelConfig.name}失败，切换模型: ${error instanceof Error ? error.message : String(error)}`);
                            await AiMessageService.handlePartialResponse(messages, accumulated);
                            lastYieldTime = Date.now();
                            continue;
                        } else {
                            logger.error('所有模型都失败');
                            throw error;
                        }
                    }
                }
            }

        } catch (error) {
            logger.error('生成AI回复时出错', { error, messageId });
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