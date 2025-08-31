/**
 * @file chat-service.ts
 * @description 聊天服务，处理SSE聊天流程和状态管理
 */

import { ChatRequest, ChatResponse, Step } from '../../types/chat';
import { AiMessageService } from './ai-message-service';
import logger from '../logger';
import Redis from 'ioredis';

/**
 * AI聊天服务类 (重命名避免与现有ChatService冲突)
 */
export class AiChatService {
    private static redis: Redis;

    /**
     * 获取Redis实例
     */
    private static getRedis(): Redis {
        if (!this.redis) {
            this.redis = new Redis({
                host: process.env.REDIS_HOST || 'localhost',
                port: parseInt(process.env.REDIS_PORT || '6379'),
                password: process.env.REDIS_PASSWORD,
            });
        }
        return this.redis;
    }

    /**
     * 处理SSE聊天流程
     */
    static async* processChatSse(
        request: ChatRequest,
        options: {
            yieldInterval?: number;
        } = {}
    ): AsyncGenerator<ChatResponse, void, unknown> {
        const { yieldInterval = 0.5 } = options;
        const redis = this.getRedis();
        const lockKey = `msg_lock:${request.message_id}`;

        try {
            // 加锁，过期时间60秒
            try {
                await redis.set(lockKey, '1', 'EX', 60, 'NX');
                logger.info(`消息锁定成功: ${request.message_id}`);
            } catch (error) {
                logger.warn(`消息加锁失败: ${request.message_id}`, { error });
                // 即使加锁失败也继续处理
            }

            // 1. 接收消息确认
            yield { step: Step.ACCEPT };

            // 2. 开始生成回复
            yield { step: Step.START_REPLY };

            // 发送初始状态消息
            yield {
                step: Step.SEND,
                status_message: this.getDefaultStatusMessage('thinking'),
            };

            // 3. 生成并发送回复
            let lastContent = ''; // 用于跟踪最后的内容

            const replyStream = AiMessageService.generateAiReply(
                request.message_id,
                { yieldInterval }
            );

            for await (const chunk of replyStream) {
                if (chunk.content) {
                    lastContent = chunk.content; // 保存最后的内容
                }
                
                yield {
                    step: Step.SEND,
                    content: chunk.content,
                    reason_content: chunk.reason_content,
                    tool_call_feedback: chunk.tool_call_feedback,
                };
            }

            // 4. 回复成功，返回完整内容
            yield {
                step: Step.SUCCESS,
                content: lastContent,
            };

        } catch (error) {
            logger.error('SSE聊天处理失败', { error, messageId: request.message_id });
            yield { step: Step.FAILED };
        } finally {
            // 解锁
            try {
                await redis.del(lockKey);
                logger.info(`消息解锁成功: ${request.message_id}`);
            } catch (error) {
                logger.warn(`消息解锁失败: ${request.message_id}`, { error });
            }

            // 5. 流程结束
            yield { step: Step.END };
        }
    }

    /**
     * 获取默认状态消息
     */
    private static getDefaultStatusMessage(status: string): string {
        const statusMessages: Record<string, string> = {
            thinking: '思考中...',
            replying: '回复中...',
        };
        return statusMessages[status] || '处理中...';
    }
}

