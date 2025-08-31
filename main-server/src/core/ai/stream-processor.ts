/**
 * @file stream-processor.ts
 * @description AI流式响应处理器，负责处理模型输出流
 */

import { ChatStreamChunk, ContentFilterError, hasContent } from '../../types/ai-chat';
import { ModelClient } from './model-client';
import logger from '../../services/logger';

/**
 * 流式处理器类
 */
export class StreamProcessor {
    /**
     * 使用指定模型进行流式回复生成
     */
    static async* streamWithModel(
        messages: Array<{ role: string; content: string }>,
        modelId: string,
        options: {
            yieldInterval?: number;
            enableTools?: boolean;
            temperature?: number;
        } = {}
    ): AsyncGenerator<ChatStreamChunk, void, unknown> {
        const { yieldInterval = 0.5, enableTools = true, temperature = 0.7 } = options;
        
        let accumulated: ChatStreamChunk = { content: '', reason_content: '' };
        let lastYieldTime = Date.now();

        try {
            // 获取工具配置 (简化版，实际应该从工具管理器获取)
            const tools = enableTools ? [] : undefined; // TODO: 集成工具管理器

            const stream = ModelClient.chatCompletionStream(modelId, messages, {
                temperature,
                tools,
            });

            for await (const chunk of stream) {
                // 处理工具调用
                if (chunk.delta?.tool_calls) {
                    const firstToolCall = chunk.delta.tool_calls[0];
                    if (firstToolCall?.function?.name) {
                        const toolName = firstToolCall.function.name;
                        // TODO: 集成工具状态服务
                        const statusMessage = `正在使用 ${toolName}...`;
                        
                        yield {
                            tool_call_feedback: {
                                name: toolName,
                                status_message: statusMessage,
                            }
                        };
                    }
                }

                // 处理文本内容
                if (chunk.delta?.content) {
                    accumulated.content = (accumulated.content || '') + chunk.delta.content;

                    // 检查是否到了输出间隔时间
                    const currentTime = Date.now();
                    if (currentTime - lastYieldTime >= yieldInterval * 1000) {
                        if (hasContent(accumulated) || accumulated.tool_call_feedback) {
                            yield {
                                content: accumulated.content,
                                reason_content: accumulated.reason_content,
                                tool_call_feedback: accumulated.tool_call_feedback,
                            };
                            lastYieldTime = currentTime;
                        }
                    }
                }

                // 处理完成原因
                if (chunk.finish_reason) {
                    logger.info(`Stream finished with reason: ${chunk.finish_reason}`);
                    
                    if (chunk.finish_reason === 'content_filter') {
                        throw new ContentFilterError();
                    } else if (chunk.finish_reason === 'length') {
                        accumulated.content = (accumulated.content || '') + '(后续内容被截断)';
                    }

                    if (chunk.finish_reason !== 'tool_calls') {
                        break;
                    }
                }
            }

            // 输出最后剩余的内容
            if (hasContent(accumulated)) {
                yield {
                    content: accumulated.content,
                    reason_content: accumulated.reason_content,
                    tool_call_feedback: accumulated.tool_call_feedback,
                };
            }

        } catch (error) {
            if (error instanceof ContentFilterError) {
                throw error;
            }
            logger.error(`流式处理失败 (模型: ${modelId})`, { error: error instanceof Error ? error.message : String(error) });
            throw error;
        }
    }

    /**
     * 处理部分响应，将已生成的内容添加到消息列表中
     */
    static async handlePartialResponse(
        messages: Array<{ role: string; content: string; partial?: boolean }>,
        accumulatedContent: ChatStreamChunk
    ): Promise<void> {
        if (accumulatedContent.content) {
            messages.push({
                role: 'assistant',
                content: accumulatedContent.content,
                partial: true,
            });
        }
    }
}