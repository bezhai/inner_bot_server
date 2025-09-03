/**
 * @file stream-output-controller.ts
 * @description 流式输出控制器，统一管理时间间隔和内容积累逻辑
 */

import { ChatStreamChunk, hasContent } from '../../types/ai-chat';

/**
 * 流式输出控制器配置
 */
export interface StreamOutputControllerOptions {
    yieldInterval?: number; // 输出间隔时间（秒）
}

/**
 * 流式输出控制器
 * 统一管理流式输出的时间间隔和内容积累逻辑
 */
export class StreamOutputController {
    private accumulated: ChatStreamChunk = { content: '', reason_content: '' };
    private lastYieldTime: number = Date.now();
    private readonly yieldInterval: number;

    constructor(options: StreamOutputControllerOptions = {}) {
        this.yieldInterval = options.yieldInterval || 0.5;
    }

    /**
     * 累积内容
     * @param chunk 新的内容块
     */
    accumulate(chunk: ChatStreamChunk): void {
        if (chunk.content) {
            this.accumulated.content = (this.accumulated.content || '') + chunk.content;
        }
        if (chunk.reason_content) {
            this.accumulated.reason_content = (this.accumulated.reason_content || '') + chunk.reason_content;
        }
        if (chunk.tool_call_feedback) {
            this.accumulated.tool_call_feedback = chunk.tool_call_feedback;
        }
    }

    /**
     * 检查是否应该输出内容
     * @returns 如果应该输出则返回内容，否则返回null
     */
    shouldYield(): ChatStreamChunk | null {
        const currentTime = Date.now();
        const shouldOutput = currentTime - this.lastYieldTime >= this.yieldInterval * 1000;
        
        if (shouldOutput && (hasContent(this.accumulated) || this.accumulated.tool_call_feedback)) {
            this.lastYieldTime = currentTime;
            return {
                content: this.accumulated.content,
                reason_content: this.accumulated.reason_content,
                tool_call_feedback: this.accumulated.tool_call_feedback,
            };
        }
        
        return null;
    }

    /**
     * 强制输出最终内容
     * @returns 最终的内容块，如果没有内容则返回null
     */
    flushFinal(): ChatStreamChunk | null {
        if (hasContent(this.accumulated)) {
            const finalChunk = {
                content: this.accumulated.content,
                reason_content: this.accumulated.reason_content,
                tool_call_feedback: this.accumulated.tool_call_feedback,
            };
            this.reset();
            return finalChunk;
        }
        return null;
    }

    /**
     * 获取当前积累的内容（不清除）
     */
    getCurrentAccumulated(): ChatStreamChunk {
        return {
            content: this.accumulated.content,
            reason_content: this.accumulated.reason_content,
            tool_call_feedback: this.accumulated.tool_call_feedback,
        };
    }

    /**
     * 重置控制器状态
     */
    reset(): void {
        this.accumulated = { content: '', reason_content: '' };
        this.lastYieldTime = Date.now();
    }

    /**
     * 更新最后输出时间（用于外部控制输出时机）
     */
    updateLastYieldTime(): void {
        this.lastYieldTime = Date.now();
    }
}