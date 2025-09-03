/**
 * @file stream-processor.ts
 * @description AI流式响应处理器，负责处理模型输出流
 */

import { ChatStreamChunk, ContentFilterError } from '../../types/ai-chat';
import { ModelClient } from './model-client';
import { ToolStatusService } from '../../services/ai/tool-status-service';
import { getToolManager } from '../../services/ai/tool-manager';
import { StreamOutputController } from './stream-output-controller';

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
        
        // 使用流式输出控制器统一管理时间间隔和内容积累
        const outputController = new StreamOutputController({ yieldInterval });

        try {
            // 获取工具配置
            let tools: any[] | undefined;
            if (enableTools) {
                try {
                    const toolManager = getToolManager();
                    tools = toolManager.getToolsSchema();
                } catch (error) {
                    console.warn('工具管理器未初始化，禁用工具调用', { error });
                    tools = undefined;
                }
            }

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
                        const statusMessage = ToolStatusService.getToolStatusMessage(toolName);
                        
                        console.info(`工具调用: ${toolName}, 状态消息: ${statusMessage}`);
                        
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
                    // 累积文本内容
                    outputController.accumulate({ content: chunk.delta.content });

                    // 检查是否应该输出
                    const shouldYieldChunk = outputController.shouldYield();
                    if (shouldYieldChunk) {
                        yield shouldYieldChunk;
                    }
                }

                // 处理完成原因
                if (chunk.finish_reason) {
                    console.info(`Stream finished with reason: ${chunk.finish_reason}`);
                    
                    if (chunk.finish_reason === 'content_filter') {
                        throw new ContentFilterError();
                    } else if (chunk.finish_reason === 'length') {
                        outputController.accumulate({ content: '(后续内容被截断)' });
                    }

                    // 对于所有完成原因都应该结束循环，让ModelClient处理工具调用逻辑
                    break;
                }
            }

            // 输出最后剩余的内容
            const finalChunk = outputController.flushFinal();
            if (finalChunk) {
                yield finalChunk;
            }

        } catch (error) {
            if (error instanceof ContentFilterError) {
                throw error;
            }
            console.error(`流式处理失败 (模型: ${modelId})`, { error: error instanceof Error ? error.message : String(error) });
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
