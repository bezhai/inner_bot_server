/**
 * @file context-service.ts
 * @description 消息上下文服务，负责获取和管理聊天上下文，完整迁移自ai-service
 */

import { ChatSimpleMessage, PromptGeneratorParam } from '../../types/ai-chat';
import { memoryClient } from '../integrations/memory-client';
import { exists } from '../../dal/redis';
import logger from '../logger';

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
     * 使用Memory服务构建上下文消息
     */
    async initContextMessages(): Promise<void> {
        try {
            console.info(`使用Memory服务构建上下文: message_id=${this.messageId}`);

            // 调用Memory服务的quick_search接口
            const results = await memoryClient.quickSearch(
                this.messageId,
                undefined, // query参数为空
                20 // max_results
            );

            // 将Memory返回的结果转换为ChatSimpleMessage
            this.contextMessages = [];

            for (const result of results) {
                const resultMessageId = result.message_id;

                // 检查是否是当前消息
                if (resultMessageId !== this.messageId) {
                    // 检查其他消息是否被锁定，如果被锁定则跳过
                    try {
                        const lockKey = `msg_lock:${resultMessageId}`;
                        const isLocked = await exists(lockKey);
                        if (isLocked) {
                            console.info(`跳过被锁定的消息: ${resultMessageId}`);
                            continue;
                        }
                    } catch (error) {
                        console.warn(`检查消息锁状态失败: ${resultMessageId}`, { error });
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

            console.info(`Memory上下文构建完成，包含 ${this.contextMessages.length} 条消息`);

        } catch (error) {
            console.error('Memory上下文构建失败', { error });
            // 降级策略：创建一个默认消息
            this.contextMessages = [
                {
                    user_name: '未知用户',
                    role: 'user',
                    content: '',
                }
            ];
            console.info('已降级为默认消息的上下文');
        }
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
