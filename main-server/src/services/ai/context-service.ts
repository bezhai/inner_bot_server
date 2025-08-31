/**
 * @file context-service.ts
 * @description 消息上下文服务，负责获取和管理聊天上下文
 */

import { ChatSimpleMessage, PromptGeneratorParam } from '../../types/ai-chat';
import logger from '../logger';
import Redis from 'ioredis';

/**
 * 消息上下文管理类
 */
export class MessageContext {
    private messageId: string;
    private contextMessages: ChatSimpleMessage[] = [];
    private tempMessages: Array<{ role: string; content: string }> = [];
    private systemPromptGenerator: (param: PromptGeneratorParam) => string;

    constructor(
        messageId: string,
        systemPromptGenerator: (param: PromptGeneratorParam) => string
    ) {
        this.messageId = messageId;
        this.systemPromptGenerator = systemPromptGenerator;
    }

    /**
     * 初始化上下文消息
     */
    async initContextMessages(): Promise<void> {
        try {
            logger.info(`使用Memory服务构建上下文: message_id=${this.messageId}`);

            // TODO: 集成memory服务，这里先用简化实现
            // 实际应该调用memory服务的quick_search接口
            const results = await this.getMemoryResults();

            // 获取Redis实例用于检查锁状态
            const redis = new Redis({
                host: process.env.REDIS_HOST || 'localhost',
                port: parseInt(process.env.REDIS_PORT || '6379'),
                password: process.env.REDIS_PASSWORD,
            });

            this.contextMessages = [];

            for (const result of results) {
                const resultMessageId = result.message_id;

                // 检查是否是当前消息
                if (resultMessageId !== this.messageId) {
                    // 检查其他消息是否被锁定，如果被锁定则跳过
                    try {
                        const lockKey = `msg_lock:${resultMessageId}`;
                        const isLocked = await redis.exists(lockKey);
                        if (isLocked) {
                            logger.info(`跳过被锁定的消息: ${resultMessageId}`);
                            continue;
                        }
                    } catch (error) {
                        logger.warn(`检查消息锁状态失败: ${resultMessageId}`, { error });
                        continue;
                    }
                }

                // 转换为ChatSimpleMessage格式
                const simpleMessage: ChatSimpleMessage = {
                    user_name: result.user_name || '未知用户',
                    role: (result.role as 'user' | 'assistant' | 'system') || 'user',
                    content: result.content || '',
                };
                this.contextMessages.push(simpleMessage);
            }

            await redis.quit();
            logger.info(`Memory上下文构建完成，包含 ${this.contextMessages.length} 条消息`);

        } catch (error) {
            logger.error('Memory上下文构建失败', { error });
            // 降级策略：创建一个默认消息
            this.contextMessages = [
                {
                    user_name: '未知用户',
                    role: 'user',
                    content: '',
                }
            ];
            logger.info('已降级为默认消息的上下文');
        }
    }

    /**
     * 获取Memory服务结果 (简化实现)
     */
    private async getMemoryResults(): Promise<Array<{
        message_id: string;
        user_name: string;
        role: string;
        content: string;
    }>> {
        // TODO: 实际应该调用memory服务的API
        // 这里返回空数组作为占位符
        return [];
    }

    /**
     * 添加临时消息
     */
    appendMessage(message: { role: string; content: string }): void {
        this.tempMessages.push(message);
    }

    /**
     * 构建完整的消息列表
     */
    build(param: PromptGeneratorParam): Array<{ role: string; content: string }> {
        const systemPrompt = this.systemPromptGenerator(param);
        
        return [
            { role: 'system', content: systemPrompt },
            ...this.contextMessages.map(msg => ({
                role: msg.role,
                content: msg.role === 'user' 
                    ? `[${msg.user_name}]: ${msg.content}`
                    : msg.content,
            })),
            ...this.tempMessages,
        ];
    }
}