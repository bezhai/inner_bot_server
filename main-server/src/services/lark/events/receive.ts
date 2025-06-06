import { LarkReceiveMessage } from 'types/lark';
import { runRules } from 'services/message-processing/rule-engine';
import { saveLarkMessage } from 'services/message-store/service';
import { MessageTransferer } from './factory';
import { publishEvent } from '@events';

export async function handleMessageReceive(params: LarkReceiveMessage) {
    try {
        const [_, message] = await Promise.all([
            saveLarkMessage(params), // 保存消息
            (async () => {
                const builtMessage = await MessageTransferer.transfer(params);
                if (!builtMessage) {
                    throw new Error('Failed to build message');
                }
                return builtMessage;
            })(),
        ]);

        // 发送消息事件
        if (message.clearText().length > 0) {
            publishEvent('message.receive', {
                messageId: message.messageId,
                chatId: message.chatId,
                message_context: message.clearText(),
            });
        }

        await runRules(message);
    } catch (error) {
        console.error(
            'Error handling message receive:',
            (error as Error).message,
            (error as Error).stack,
        );
    }
}
