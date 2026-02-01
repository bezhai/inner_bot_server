import { StreamAction } from 'types/ai';
import { ChatStateMachineCallbacks } from '../chat-state-machine';
import { ReplyStrategy, ReplyStrategyContext } from './reply-strategy.interface';
import { MultiMessageConfig } from '@config/multi-message.config';
import { replyMessage, sendMsg } from '@lark/basic/message';
import dayjs from 'dayjs';

/**
 * 休眠函数
 */
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 多消息回复策略
 * 将 AI 回复拆分为多条独立消息发送
 */
export class MultiMessageReplyStrategy implements ReplyStrategy {
    private buffer = '';
    private lastSendTime = 0;
    private messagesSent = 0;
    private isFirstMessage = true;
    private createTime: number;
    private firstMessageId?: string;
    private fullContent = '';

    constructor(
        private context: ReplyStrategyContext,
        private config: MultiMessageConfig,
    ) {
        this.createTime = dayjs().valueOf();
    }

    async onStartReply(): Promise<void> {
        // 多消息模式不创建卡片，只初始化状态
        this.buffer = '';
        this.lastSendTime = 0;
        this.messagesSent = 0;
        this.isFirstMessage = true;
        this.fullContent = '';
        console.debug('[MultiMessageStrategy] 开始多消息回复');
    }

    async onSend(action: StreamAction): Promise<void> {
        // 只处理 text 类型，忽略 think 和 status
        if (action.type !== 'text') {
            return;
        }

        this.buffer += action.content;
        this.fullContent += action.content;
        await this.flushCompleteMessages();
    }

    async onSuccess(content: string): Promise<void> {
        // 发送 buffer 中剩余内容
        const remaining = this.buffer.trim();
        if (remaining) {
            await this.sendWithDelay(remaining);
        }
        console.debug(`[MultiMessageStrategy] 回复成功，共发送 ${this.messagesSent} 条消息`);
    }

    async onFailed(error: Error): Promise<void> {
        // 发送错误消息
        const errorMessage = `抱歉，出了点问题：${error.message}`;
        try {
            if (this.isFirstMessage) {
                await replyMessage(this.context.messageId, errorMessage);
            } else {
                await sendMsg(this.context.chatId, errorMessage);
            }
        } catch (sendError) {
            console.error('[MultiMessageStrategy] 发送错误消息失败:', sendError);
        }
    }

    async onEnd(): Promise<void> {
        // 清理状态
        this.buffer = '';
        console.debug('[MultiMessageStrategy] 多消息回复结束');
    }

    getCallbacks(): ChatStateMachineCallbacks {
        return {
            onAccept: async () => {
                console.debug('[MultiMessageStrategy] 消息已被接收');
            },
            onStartReply: () => this.onStartReply(),
            onSend: (action) => this.onSend(action),
            onSuccess: (content) => this.onSuccess(content),
            onFailed: (error) => this.onFailed(error),
            onEnd: () => this.onEnd(),
        };
    }

    /**
     * 获取第一条消息的ID（用于保存消息）
     */
    getMessageId(): string | undefined {
        return this.firstMessageId;
    }

    /**
     * 获取创建时间（用于保存消息）
     */
    getCreateTime(): number {
        return this.createTime;
    }

    /**
     * 获取完整内容（用于保存消息）
     */
    getFullContent(): string {
        return this.fullContent;
    }

    // ========== 私有方法 ==========

    /**
     * 刷新并发送完整的消息
     */
    private async flushCompleteMessages(): Promise<void> {
        const { splitMarker, maxMessages } = this.config;

        while (this.buffer.includes(splitMarker)) {
            const splitIndex = this.buffer.indexOf(splitMarker);
            const message = this.buffer.substring(0, splitIndex);
            const rest = this.buffer.substring(splitIndex + splitMarker.length);
            const trimmed = message.trim();

            if (trimmed) {
                // 检查是否需要合并（超过阈值）
                if (this.messagesSent >= maxMessages - 1) {
                    // 已发送 maxMessages-1 条，剩余内容合并到最后一条
                    console.debug(
                        `[MultiMessageStrategy] 已达到最大消息数 ${maxMessages}，剩余内容将合并`,
                    );
                    this.buffer = rest;
                    return;
                }

                await this.sendWithDelay(trimmed);
            }

            this.buffer = rest;
        }
    }

    /**
     * 带延迟发送消息
     */
    private async sendWithDelay(content: string): Promise<void> {
        if (!content) return;

        const { defaultDelay, minDelay, maxDelay } = this.config;

        // 间隔控制（第一条消息不等待）
        if (!this.isFirstMessage) {
            const elapsed = Date.now() - this.lastSendTime;
            const delay = Math.max(minDelay, Math.min(defaultDelay, maxDelay));
            if (elapsed < delay) {
                await sleep(delay - elapsed);
            }
        }

        try {
            // 发送消息
            if (this.isFirstMessage) {
                // 第一条消息作为回复
                console.debug(`[MultiMessageStrategy] 发送第一条消息（回复）: ${content.substring(0, 50)}...`);
                await replyMessage(this.context.messageId, content);
                this.isFirstMessage = false;
                // 注意：replyMessage 不返回 messageId，这里暂时使用 context.messageId
                // 实际场景中可能需要修改 replyMessage 返回 messageId
                this.firstMessageId = this.context.messageId;
            } else {
                // 后续消息作为独立消息
                console.debug(`[MultiMessageStrategy] 发送第 ${this.messagesSent + 1} 条消息: ${content.substring(0, 50)}...`);
                await sendMsg(this.context.chatId, content);
            }

            this.lastSendTime = Date.now();
            this.messagesSent++;
        } catch (error) {
            console.error('[MultiMessageStrategy] 发送消息失败:', error);
            throw error;
        }
    }
}
