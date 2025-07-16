import { LarkReceiveMessage } from 'types/lark';
import { runRules } from 'services/message-processing/rule-engine';
import { saveLarkMessage } from 'services/message-store/service';
import { MessageTransferer } from './factory';
import { storeMessage } from 'services/integrations/memory';
import { getBotUnionId } from 'utils/bot/bot-var';
import dayjs from 'dayjs';

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

        await storeMessage({
            user_id: message.sender,
            user_open_id: message.senderOpenId,
            user_name: message.senderInfo?.name ?? '',
            content: message.toMarkdown(),
            is_mention_bot: message.hasMention(getBotUnionId()) || message.isP2P(),
            role: 'user',
            message_id: message.messageId,
            chat_id: message.chatId,
            chat_type: message.isP2P() ? 'p2p' : 'group',
            create_time: dayjs(parseInt(message.createTime ?? '0')).toISOString(),
            root_message_id: message.rootId,
            reply_message_id: message.parentMessageId,
        });

        await runRules(message);
    } catch (error) {
        console.error(
            'Error handling message receive:',
            (error as Error).message,
            (error as Error).stack,
        );
    }
}
